import { Resolver } from "node:dns/promises"
import { Agent, buildConnector, fetch as undiciFetch } from "undici"

const CLOUDFLARE_DNS_SERVERS = ["1.1.1.1", "1.0.0.1"]

export const resolveCloudflareIpv4 = async (
  hostname: string,
): Promise<string> => {
  const resolver = new Resolver()
  resolver.setServers(CLOUDFLARE_DNS_SERVERS)

  const addresses = await resolver.resolve4(hostname)
  const address = addresses[0]
  if (address === undefined) {
    throw new Error(`Cloudflare DNS returned no IPv4 address for ${hostname}`)
  }
  return address
}

export const createCloudflareDnsFetch = async (
  hostname: string,
): Promise<{ fetch: typeof fetch; close: () => Promise<void> }> => {
  const address = await resolveCloudflareIpv4(hostname)

  const connect = buildConnector({})
  const dispatcher = new Agent({
    connect(options, callback) {
      connect(
        {
          ...options,
          hostname: address,
          servername: options.servername ?? options.hostname,
        },
        callback,
      )
    },
  })

  const cloudflareDnsFetch = ((input, init) =>
    undiciFetch(input as never, {
      ...init,
      dispatcher,
    }) as unknown as ReturnType<typeof fetch>) as typeof fetch

  return {
    fetch: cloudflareDnsFetch,
    close: (): Promise<void> => dispatcher.close(),
  }
}

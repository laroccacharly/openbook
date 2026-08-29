import { Fragment } from "react"

const URL_PART = /(https?:\/\/\S+)/g
const TRAILING_PUNCT = /[.,;:!?)]+$/

type LinkifyTextProps = {
  text: string
}

export function LinkifyText({ text }: LinkifyTextProps) {
  return text.split(URL_PART).map((part, index) => {
    if (!part.startsWith("http://") && !part.startsWith("https://")) {
      return part
    }

    const href = part.replace(TRAILING_PUNCT, "")
    const trailing = part.slice(href.length)

    return (
      <Fragment key={index}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {href}
        </a>
        {trailing}
      </Fragment>
    )
  })
}

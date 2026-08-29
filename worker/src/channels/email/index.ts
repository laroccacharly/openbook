export { emailChannelRouter } from "./api"
export { emailAddressForDomain } from "./config"
export {
  createInboundEmailHandler,
  emailHtmlToText,
  handleInboundEmail,
  inboundEmailMessage,
  type InboundEmailEventMessage,
} from "./inbound"
export { sendEmail, type SendEmailOutcome } from "./outbound"
export {
  SendEmailInputSchema,
  SendEmailResultSchema,
  type SendEmailInput,
  type SendEmailResult,
} from "./types"

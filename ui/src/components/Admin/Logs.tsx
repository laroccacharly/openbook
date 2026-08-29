import { LlmTasksComponent } from "./LlmTasksComponent"
import { MessagesComponent } from "@/components/Messages"
import { MessageResponsesComponent } from "./MessageResponsesComponent"
import { WorkflowsComponent } from "./WorkflowsComponent"

export function Logs() {
  return (
    <>
      <WorkflowsComponent />
      <MessagesComponent />
      <LlmTasksComponent />
      <MessageResponsesComponent />
    </>
  )
}

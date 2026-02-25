import { permanentRedirect } from "next/navigation";

export default function AssistantInboxRedirect() {
  permanentRedirect("/inbox?tab=email");
}

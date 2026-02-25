import { permanentRedirect } from "next/navigation";

export default function AssistantRedirect() {
  permanentRedirect("/inbox");
}

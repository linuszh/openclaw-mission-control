import { permanentRedirect } from "next/navigation";

export default function ApprovalsRedirect() {
  permanentRedirect("/inbox?tab=approvals");
}

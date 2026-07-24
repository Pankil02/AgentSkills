import { publish } from "../../events/publish";
export function createUser() { publish("user.created"); }

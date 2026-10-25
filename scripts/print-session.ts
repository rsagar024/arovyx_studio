// Prints a valid admin session token for local middleware testing.
import { signSession } from "../src/lib/auth";

signSession().then((token) => console.log(token));

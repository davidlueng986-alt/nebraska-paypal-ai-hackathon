import { Nebraska } from "./service";
import { getStore } from "./store";
import { getDecisionProvider } from "./decisions";
import { getPayments } from "../integrations/paypal";
let instance: Nebraska | undefined;
export function getService() {
  return (instance ??= new Nebraska(
    getStore(),
    getDecisionProvider(),
    getPayments(),
  ));
}

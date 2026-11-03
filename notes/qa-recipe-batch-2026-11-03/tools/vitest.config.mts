import base from "../../../apps/web/vitest.config";
import { fileURLToPath } from "node:url";
export default {
  ...base,
  root:fileURLToPath(new URL("../../../apps/web/",import.meta.url)),
  test:{...base.test,include:[fileURLToPath(new URL("./recovery-current.integration.test.ts",import.meta.url))],fileParallelism:false,testTimeout:60000,hookTimeout:30000}
};

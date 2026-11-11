import { getService } from "../src/core/runtime";
import { seedDemo } from "../src/core/seed";
const service = getService();
console.log(await seedDemo(service));
await service.store.close();

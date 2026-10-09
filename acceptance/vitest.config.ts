import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['acceptance/*.live.test.ts'],environment:'node',testTimeout:90000,fileParallelism:false}});

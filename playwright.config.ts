import { defineConfig } from "@playwright/test";
export default defineConfig({testDir:"./tests",testMatch:"**/*.spec.ts",workers:1,reporter:"list",use:{baseURL:"http://127.0.0.1:3012",headless:true},outputDir:"output/auth-qa/results"});

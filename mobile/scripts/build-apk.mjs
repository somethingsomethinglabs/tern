import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tools = join(root, ".tools");
const env = { ...process.env };
env.JAVA_HOME ||= join(tools, "jdk");
env.ANDROID_HOME ||= env.ANDROID_SDK_ROOT || join(tools, "android-sdk");
env.GRADLE_USER_HOME ||= join(tools, "gradle");
env.ANDROID_USER_HOME ||= join(tools, "android-user");
if (!existsSync(env.JAVA_HOME) || !existsSync(env.ANDROID_HOME))
  throw new Error("Install JDK 21 and the Android SDK, then set JAVA_HOME and ANDROID_HOME. See mobile/README.md.");
const release = process.argv.includes('--release');
if (release && ['TERN_ANDROID_KEYSTORE', 'TERN_ANDROID_STORE_PASSWORD', 'TERN_ANDROID_KEY_PASSWORD'].some(key => !env[key]))
  throw new Error('Release builds require the Android publisher keystore and passwords.');
const android = join(root, "mobile/android");
const result = spawnSync(process.platform === "win32" ? "gradlew.bat" : "./gradlew", [release ? "assembleRelease" : "assembleDebug", "--no-daemon", "--console=plain"], { cwd: android, env, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
const artifacts = join(root, "mobile/artifacts");
mkdirSync(artifacts, { recursive: true });
const name = release ? "tern-android.apk" : "tern-android-debug.apk";
const apk = join(artifacts, name);
copyFileSync(join(android, release ? "app/build/outputs/apk/release/app-release.apk" : "app/build/outputs/apk/debug/app-debug.apk"), apk);
const hash = createHash("sha256").update(readFileSync(apk)).digest("hex");
writeFileSync(apk + ".sha256", `${hash}  ${name}\n`);
console.log(`APK: ${apk}\nSHA-256: ${hash}`);

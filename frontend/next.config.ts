import type { NextConfig } from "next";
import os from "os";

// Automatically detect local IPv4 network addresses to allow LAN connections during dev mode
const devOrigins = ["localhost", "127.0.0.1"];
const interfaces = os.networkInterfaces();
for (const devName in interfaces) {
  const iface = interfaces[devName];
  if (iface) {
    for (const alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) {
        devOrigins.push(alias.address);
        devOrigins.push(`${alias.address}:3000`); // Whitelist both bare IP and IP with port
      }
    }
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
};

export default nextConfig;

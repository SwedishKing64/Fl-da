// Usage: npm run catalog:seed [-- --admin you@shop.com "Your Name" password] [--snow]
//
// A fresh Flöda is blank: it learns the shop from its own export during setup, and the
// snow-and-outdoor rules are seeded when that pack is chosen there. `--snow` seeds them here for a
// development database; `--admin` makes an account so the setup walk-through can be skipped.
import { prisma } from "../src/lib/catalog/db";
import { seedDefaults } from "../src/lib/catalog/seed";
import { hashPassword } from "../src/lib/catalog/auth";
import { saveShopProfile } from "../src/lib/catalog/shop-profile";

async function main() {
  if (process.argv.includes("--snow")) {
    await saveShopProfile({ pack: "snow-outdoor" });
    const result = await seedDefaults();
    console.log(`Snow and outdoor pack on: seeded ${result.categoryRules} category rules and ${result.tagRules} tag rules.`);
  }
  const i = process.argv.indexOf("--admin");
  if (i > -1) {
    const [email, name, password] = process.argv.slice(i + 1);
    if (!email || !password) throw new Error("--admin needs: email name password");
    await prisma.user.upsert({ where: { email: email.toLowerCase() }, create: { email: email.toLowerCase(), name: name || "Admin", role: "ADMIN", passwordHash: hashPassword(password) }, update: { passwordHash: hashPassword(password), role: "ADMIN" } });
    console.log(`Admin account ready: ${email}`);
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });

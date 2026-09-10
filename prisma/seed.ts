// Usage: npm run catalog:seed [-- --admin you@shop.com "Your Name" password]
import { prisma } from "../src/lib/catalog/db";
import { seedDefaults } from "../src/lib/catalog/seed";
import { hashPassword } from "../src/lib/catalog/auth";

async function main() {
  const result = await seedDefaults();
  console.log(`Seeded ${result.pricingRules} pricing rules, ${result.categoryRules} category rules and ${result.tagRules} tag rules.`);
  const i = process.argv.indexOf("--admin");
  if (i > -1) {
    const [email, name, password] = process.argv.slice(i + 1);
    if (!email || !password) throw new Error("--admin needs: email name password");
    await prisma.user.upsert({ where: { email: email.toLowerCase() }, create: { email: email.toLowerCase(), name: name || "Admin", role: "ADMIN", passwordHash: hashPassword(password) }, update: { passwordHash: hashPassword(password), role: "ADMIN" } });
    console.log(`Admin account ready: ${email}`);
  }
  for (const name of ["Amer Sports AU (Atomic/Salomon)", "Völkl / Marker / Dalbello"]) {
    await prisma.supplier.upsert({ where: { name }, create: { name, defaultCurrency: "AUD", defaultGstTreatment: "EXCLUSIVE" }, update: {} });
  }
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });

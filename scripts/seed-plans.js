const { PrismaClient } = require('../packages/db/src/generated-client');
const prisma = new PrismaClient();

async function main() {
  console.log('Ensuring subscription plans exist...');
  
  const plans = [
    {
      id: 'b6491cba-adde-47db-8f96-98303e118f54',
      name: 'Starter',
      stripePriceId: 'price_starter_monthly',
      maxBranches: 1,
      maxRestaurants: 1,
      maxProductsPerBranch: 50,
      allowCustomDomains: false,
      allowOnlinePayments: false,
      allowAnalytics: false,
      priceMonthly: 29.99,
      priceYearly: 299.99,
    },
    {
      id: 'd98334d4-fc0c-4344-88f6-449fed277a20',
      name: 'Growth',
      stripePriceId: 'price_growth_monthly',
      maxBranches: 5,
      maxRestaurants: 3,
      maxProductsPerBranch: 200,
      allowCustomDomains: true,
      allowOnlinePayments: true,
      allowAnalytics: false,
      priceMonthly: 79.99,
      priceYearly: 799.99,
    },
    {
      id: 'a33196e9-92cf-4a7b-8efe-d8ec222f821a',
      name: 'Enterprise',
      stripePriceId: 'price_enterprise_monthly',
      maxBranches: 50,
      maxRestaurants: 20,
      maxProductsPerBranch: 1000,
      allowCustomDomains: true,
      allowOnlinePayments: true,
      allowAnalytics: true,
      priceMonthly: 199.99,
      priceYearly: 1999.99,
    },
  ];

  for (const plan of plans) {
    const existing = await prisma.subscriptionPlan.findUnique({ where: { id: plan.id } });
    if (!existing) {
      await prisma.subscriptionPlan.create({ data: plan });
      console.log(`Created plan: ${plan.name}`);
    } else {
      console.log(`Plan already exists: ${plan.name}`);
    }
  }

  console.log('Plans ready.');
}

main()
  .catch(e => { console.error('Failed:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());

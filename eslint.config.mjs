import next from "eslint-config-next";

/**
 * Configuration ESLint à plat.
 *
 * `eslint-config-next` exporte directement un tableau de configurations
 * depuis la version 16 : il n'y a plus à passer par `FlatCompat`.
 */
const configuration = [
  ...next,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "prisma/seed.ts"],
  },
];

export default configuration;

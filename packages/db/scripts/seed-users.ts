export type SeedUser = {
  email: string;
  displayName: string;
  role: "user" | "editor" | "moderator" | "admin";
};

export const seedUsers: SeedUser[] = [
  { email: "qa.admin@localhost", displayName: "QA Admin", role: "admin" },
  { email: "qa.moderator@localhost", displayName: "QA Moderator", role: "moderator" },
  { email: "qa.editor@localhost", displayName: "QA Editor", role: "editor" },
  { email: "qa.user@localhost", displayName: "QA Brewer", role: "user" }
];

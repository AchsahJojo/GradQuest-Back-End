type Rule = { allow: boolean; path: string };
type Group = { agents: string[]; rules: Rule[] };

export function isPathAllowed(
  robotsTxt: string,
  pathAndQuery: string,
  agentName = "GradQuestSOP",
): boolean {
  const groups = parseRobots(robotsTxt);
  const specific = groups.filter((group) =>
    group.agents.some((agent) => agent.toLowerCase() === agentName.toLowerCase()),
  );
  const fallback = groups.filter((group) => group.agents.includes("*"));
  const rules = (specific.length > 0 ? specific : fallback).flatMap((group) => group.rules);
  const path = (pathAndQuery.split("?")[0] || "/").trim() || "/";

  let matched: Rule | null = null;
  for (const rule of rules) {
    if (!rule.path) continue;
    const exact = rule.path.endsWith("$");
    const prefix = exact ? rule.path.slice(0, -1) : rule.path;
    const hits = exact ? path === prefix : path.startsWith(prefix);
    if (hits && (!matched || prefix.length > matched.path.replace(/\$$/, "").length)) {
      matched = rule;
    }
  }
  return matched ? matched.allow : true;
}

function parseRobots(robotsTxt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      current = null;
      continue;
    }
    const splitAt = line.indexOf(":");
    if (splitAt < 0) continue;
    const key = line.slice(0, splitAt).trim().toLowerCase();
    const value = line.slice(splitAt + 1).trim();
    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value);
      continue;
    }
    if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ allow: key === "allow", path: value });
    }
  }
  return groups;
}

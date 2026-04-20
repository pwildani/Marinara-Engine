// ──────────────────────────────────────────────
// Service: Character Commands
// ──────────────────────────────────────────────
// Parses hidden commands from character messages in Conversation mode.
// Commands are embedded by the LLM in the response and stripped before
// the message is shown to the user.
//
// Supported commands:
// - [schedule_update: status="online", activity="free time"]
// - [cross_post: target="group"] or [cross_post: target="CharName"]
// - [selfie] or [selfie: context="description of the selfie"]
// - [memory: target="CharName", summary="description of the memory"]
// - [scene: scenario="...", background="...", plan="..."] (initiate a mini-roleplay scene)
// - [haptic: action="vibrate", intensity=0.5, duration=3] (haptic device feedback)
// - <influence>text</influence> (OOC influence for connected roleplay)
//
// Assistant commands (Professor Mari):
// - [create_persona: name="...", description="...", personality="...", appearance="..."]
// - [create_character: name="...", description="...", personality="...", first_message="...", scenario="..."]
// - [create_chat: character="...", mode="conversation|roleplay"]
// - [navigate: panel="...", tab="..."]
// - [fetch: type="character|persona|lorebook|chat|preset", name="..."]
// - [create_lorebook: name="...", description="...", category="world|character|npc|uncategorized"]
// - [create_lorebook_entry: lorebook="...", name="...", content="...", keys="key1,key2", tag="..."]
// - [update_lorebook_entry: lorebook="...", entry_name="...", content="...", keys="key1,key2", tag="..."]

export interface ScheduleUpdateCommand {
  type: "schedule_update";
  status?: "online" | "idle" | "dnd" | "offline";
  activity?: string;
  duration?: string;
}

export interface CrossPostCommand {
  type: "cross_post";
  /** "group" to post in a group chat, or a character/chat name for DM */
  target: string;
}

export interface SelfieCommand {
  type: "selfie";
  /** Optional context hint from the character about the selfie */
  context?: string;
}

export interface MemoryCommand {
  type: "memory";
  /** Target character name */
  target: string;
  /** Short description of the memory */
  summary: string;
}

export interface SceneCommand {
  type: "scene";
  /** Description of the scene/scenario the character wants to play out */
  scenario: string;
  /** Optional background suggestion */
  background?: string;
  /** Optional plot plan / outline for how the scene unfolds */
  plan?: string;
}

export interface InfluenceCommand {
  type: "influence";
  /** The OOC influence text to inject into the connected roleplay */
  content: string;
}

export interface HapticCommand {
  type: "haptic";
  /** Device action */
  action: "vibrate" | "oscillate" | "rotate" | "position" | "stop";
  /** Intensity / speed (0.0-1.0) */
  intensity?: number;
  /** Duration in seconds */
  duration?: number;
}

// ── Assistant commands (Professor Mari) ──

export interface CreatePersonaCommand {
  type: "create_persona";
  name: string;
  description?: string;
  personality?: string;
  appearance?: string;
}

export interface CreateCharacterCommand {
  type: "create_character";
  name: string;
  description?: string;
  personality?: string;
  firstMessage?: string;
  scenario?: string;
}

export interface UpdateCharacterCommand {
  type: "update_character";
  name: string;
  description?: string;
  personality?: string;
  firstMessage?: string;
  scenario?: string;
}

export interface UpdatePersonaCommand {
  type: "update_persona";
  name: string;
  description?: string;
  personality?: string;
  appearance?: string;
}

export interface CreateChatCommand {
  type: "create_chat";
  character: string;
  mode?: "conversation" | "roleplay";
}

export interface NavigateCommand {
  type: "navigate";
  panel: string;
  tab?: string;
}

export interface FetchCommand {
  type: "fetch";
  /** What kind of item to fetch */
  fetchType: "character" | "persona" | "lorebook" | "chat" | "preset";
  /** Name of the item to retrieve */
  name: string;
}

export interface CreateLorebookCommand {
  type: "create_lorebook";
  name: string;
  description?: string;
  category?: string;
}

export interface CreateLorebookEntryCommand {
  type: "create_lorebook_entry";
  /** Name of the target lorebook */
  lorebook: string;
  name: string;
  content?: string;
  /** Comma-separated activation keywords */
  keys?: string;
  tag?: string;
}

export interface UpdateLorebookEntryCommand {
  type: "update_lorebook_entry";
  /** Name of the target lorebook */
  lorebook: string;
  /** Exact name of the entry to update */
  entryName: string;
  content?: string;
  /** Comma-separated activation keywords */
  keys?: string;
  tag?: string;
}

export type AssistantCommand =
  | CreatePersonaCommand
  | CreateCharacterCommand
  | UpdateCharacterCommand
  | UpdatePersonaCommand
  | CreateChatCommand
  | NavigateCommand
  | FetchCommand
  | CreateLorebookCommand
  | CreateLorebookEntryCommand
  | UpdateLorebookEntryCommand;

export type CharacterCommand =
  | ScheduleUpdateCommand
  | CrossPostCommand
  | SelfieCommand
  | MemoryCommand
  | SceneCommand
  | InfluenceCommand
  | HapticCommand
  | AssistantCommand;

/**
 * Decode JSON-style escape sequences from a field value captured inside "...".
 * Supports: \" \\ \/ \b \f \n \r \t \uXXXX
 */
function unescapeStr(s: string): string {
  return s.replace(/\\(["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, (_, seq: string) => {
    switch (seq[0]) {
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      default: return String.fromCharCode(parseInt(seq.slice(1), 16));
    }
  });
}

// Matches a quoted field value that may contain JSON-style escapes (\" \\ \n etc.)
// Capture group: the raw escaped content between the quotes.
const SV = `"((?:[^"\\\\]|\\\\.)*)"`;

/** Build a regex that extracts key="value" where value may contain JSON escapes. */
function fv(key: string): RegExp {
  return new RegExp(`${key}=${SV}`);
}

// Outer bracket body: one or more chars that are not ] unless escaped as \]
const BODY = `((?:[^\\]\\\\]|\\\\.)+)`;

/** Regex patterns for each command type */
const SCHEDULE_UPDATE_RE = new RegExp(`\\[schedule_update:\\s*${BODY}\\]`, "gi");
const CROSS_POST_RE = /\[cross_post:\s*target="((?:[^"\\]|\\.)*)"\]/gi;
const SELFIE_RE = /\[selfie(?::\s*context="((?:[^"\\]|\\.)*)")?\]/gi;
const MEMORY_RE = /\[memory:\s*target="((?:[^"\\]|\\.)*)"\s*,\s*summary="((?:[^"\\]|\\.)*)"\]/gi;
const SCENE_RE = new RegExp(`\\[scene:\\s*${BODY}\\]`, "gi");
const HAPTIC_RE = new RegExp(`\\[haptic:\\s*${BODY}\\]`, "gi");
const INFLUENCE_RE = /<influence>([\s\S]*?)<\/influence>/gi;

// Assistant command regexes
const CREATE_PERSONA_RE = new RegExp(`\\[create_persona:\\s*${BODY}\\]`, "gi");
const CREATE_CHARACTER_RE = new RegExp(`\\[create_character:\\s*${BODY}\\]`, "gi");
const UPDATE_CHARACTER_RE = new RegExp(`\\[update_character:\\s*${BODY}\\]`, "gi");
const UPDATE_PERSONA_RE = new RegExp(`\\[update_persona:\\s*${BODY}\\]`, "gi");
const CREATE_CHAT_RE = new RegExp(`\\[create_chat:\\s*${BODY}\\]`, "gi");
const NAVIGATE_RE = new RegExp(`\\[navigate:\\s*${BODY}\\]`, "gi");
const FETCH_RE = new RegExp(`\\[fetch:\\s*${BODY}\\]`, "gi");
const CREATE_LOREBOOK_RE = new RegExp(`\\[create_lorebook:\\s*${BODY}\\]`, "gi");
const CREATE_LOREBOOK_ENTRY_RE = new RegExp(`\\[create_lorebook_entry:\\s*${BODY}\\]`, "gi");
const UPDATE_LOREBOOK_ENTRY_RE = new RegExp(`\\[update_lorebook_entry:\\s*${BODY}\\]`, "gi");
/**
 * Parse all character commands from a message and return the cleaned message
 * with commands stripped out.
 */
export function parseCharacterCommands(content: string): {
  cleanContent: string;
  commands: CharacterCommand[];
} {
  const commands: CharacterCommand[] = [];

  // Parse schedule_update commands
  for (const match of content.matchAll(SCHEDULE_UPDATE_RE)) {
    const params = match[1]!;
    const cmd: ScheduleUpdateCommand = { type: "schedule_update" };

    const statusMatch = params.match(fv("status"));
    if (statusMatch) {
      const s = unescapeStr(statusMatch[1]!).toLowerCase();
      if (["online", "idle", "dnd", "offline"].includes(s)) {
        cmd.status = s as ScheduleUpdateCommand["status"];
      }
    }

    const activityMatch = params.match(fv("activity"));
    if (activityMatch) cmd.activity = unescapeStr(activityMatch[1]!);

    const durationMatch = params.match(fv("duration"));
    if (durationMatch) cmd.duration = unescapeStr(durationMatch[1]!);

    commands.push(cmd);
  }

  // Parse cross_post commands
  for (const match of content.matchAll(CROSS_POST_RE)) {
    commands.push({ type: "cross_post", target: unescapeStr(match[1]!) });
  }

  // Parse selfie commands
  for (const match of content.matchAll(SELFIE_RE)) {
    commands.push({ type: "selfie", context: match[1] ? unescapeStr(match[1]) : undefined });
  }

  // Parse memory commands
  for (const match of content.matchAll(MEMORY_RE)) {
    commands.push({ type: "memory", target: unescapeStr(match[1]!), summary: unescapeStr(match[2]!) });
  }

  // Parse scene commands
  for (const match of content.matchAll(SCENE_RE)) {
    const params = match[1]!;
    const cmd: SceneCommand = { type: "scene", scenario: "" };

    const scenarioMatch = params.match(fv("scenario"));
    if (scenarioMatch) cmd.scenario = unescapeStr(scenarioMatch[1]!);

    const bgMatch = params.match(fv("background"));
    if (bgMatch) cmd.background = unescapeStr(bgMatch[1]!);

    const planMatch = params.match(fv("plan"));
    if (planMatch) cmd.plan = unescapeStr(planMatch[1]!);

    // Only add if we got a scenario
    if (cmd.scenario) commands.push(cmd);
  }

  // Parse influence commands (<influence>text</influence>)
  for (const match of content.matchAll(INFLUENCE_RE)) {
    const text = match[1]!.trim();
    if (text) commands.push({ type: "influence", content: text });
  }

  // Parse haptic commands
  for (const match of content.matchAll(HAPTIC_RE)) {
    const params = match[1]!;
    const cmd: HapticCommand = { type: "haptic", action: "vibrate" };
    const actionMatch = params.match(fv("action"));
    if (actionMatch) {
      const a = unescapeStr(actionMatch[1]!).toLowerCase();
      if (["vibrate", "oscillate", "rotate", "position", "stop"].includes(a)) {
        cmd.action = a as HapticCommand["action"];
      }
    }
    const intensityMatch = params.match(/intensity=([0-9.]+)/);
    if (intensityMatch) {
      const v = parseFloat(intensityMatch[1]!);
      if (Number.isFinite(v)) cmd.intensity = Math.max(0, Math.min(1, v));
    }
    const durationMatch = params.match(/duration=([0-9.]+)/);
    if (durationMatch) {
      const v = parseFloat(durationMatch[1]!);
      if (Number.isFinite(v)) cmd.duration = Math.max(0, v);
    }
    commands.push(cmd);
  }

  // Parse assistant commands (Professor Mari)
  for (const match of content.matchAll(CREATE_PERSONA_RE)) {
    const params = match[1]!;
    const cmd: CreatePersonaCommand = { type: "create_persona", name: "" };
    const nameMatch = params.match(fv("name"));
    if (nameMatch) cmd.name = unescapeStr(nameMatch[1]!);
    const descMatch = params.match(fv("description"));
    if (descMatch) cmd.description = unescapeStr(descMatch[1]!);
    const persMatch = params.match(fv("personality"));
    if (persMatch) cmd.personality = unescapeStr(persMatch[1]!);
    const appMatch = params.match(fv("appearance"));
    if (appMatch) cmd.appearance = unescapeStr(appMatch[1]!);
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(CREATE_CHARACTER_RE)) {
    const params = match[1]!;
    const cmd: CreateCharacterCommand = { type: "create_character", name: "" };
    const nameMatch = params.match(fv("name"));
    if (nameMatch) cmd.name = unescapeStr(nameMatch[1]!);
    const descMatch = params.match(fv("description"));
    if (descMatch) cmd.description = unescapeStr(descMatch[1]!);
    const persMatch = params.match(fv("personality"));
    if (persMatch) cmd.personality = unescapeStr(persMatch[1]!);
    const fmMatch = params.match(fv("first_message"));
    if (fmMatch) cmd.firstMessage = unescapeStr(fmMatch[1]!);
    const scenMatch = params.match(fv("scenario"));
    if (scenMatch) cmd.scenario = unescapeStr(scenMatch[1]!);
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(UPDATE_CHARACTER_RE)) {
    const params = match[1]!;
    const cmd: UpdateCharacterCommand = { type: "update_character", name: "" };
    const nameMatch = params.match(fv("name"));
    if (nameMatch) cmd.name = unescapeStr(nameMatch[1]!);
    const descMatch = params.match(fv("description"));
    if (descMatch) cmd.description = unescapeStr(descMatch[1]!);
    const persMatch = params.match(fv("personality"));
    if (persMatch) cmd.personality = unescapeStr(persMatch[1]!);
    const fmMatch = params.match(fv("first_message"));
    if (fmMatch) cmd.firstMessage = unescapeStr(fmMatch[1]!);
    const scenMatch = params.match(fv("scenario"));
    if (scenMatch) cmd.scenario = unescapeStr(scenMatch[1]!);
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(UPDATE_PERSONA_RE)) {
    const params = match[1]!;
    const cmd: UpdatePersonaCommand = { type: "update_persona", name: "" };
    const nameMatch = params.match(fv("name"));
    if (nameMatch) cmd.name = unescapeStr(nameMatch[1]!);
    const descMatch = params.match(fv("description"));
    if (descMatch) cmd.description = unescapeStr(descMatch[1]!);
    const persMatch = params.match(fv("personality"));
    if (persMatch) cmd.personality = unescapeStr(persMatch[1]!);
    const appMatch = params.match(fv("appearance"));
    if (appMatch) cmd.appearance = unescapeStr(appMatch[1]!);
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(CREATE_CHAT_RE)) {
    const params = match[1]!;
    const cmd: CreateChatCommand = { type: "create_chat", character: "" };
    const charMatch = params.match(fv("character"));
    if (charMatch) cmd.character = unescapeStr(charMatch[1]!);
    const modeMatch = params.match(fv("mode"));
    if (modeMatch) {
      const m = unescapeStr(modeMatch[1]!);
      if (m === "conversation" || m === "roleplay") cmd.mode = m;
    }
    if (cmd.character) commands.push(cmd);
  }

  for (const match of content.matchAll(NAVIGATE_RE)) {
    const params = match[1]!;
    const cmd: NavigateCommand = { type: "navigate", panel: "" };
    const panelMatch = params.match(fv("panel"));
    if (panelMatch) cmd.panel = unescapeStr(panelMatch[1]!);
    const tabMatch = params.match(fv("tab"));
    if (tabMatch) cmd.tab = unescapeStr(tabMatch[1]!);
    if (cmd.panel) commands.push(cmd);
  }

  for (const match of content.matchAll(FETCH_RE)) {
    const params = match[1]!;
    const cmd: FetchCommand = { type: "fetch", fetchType: "character", name: "" };
    const typeMatch = params.match(fv("type"));
    if (typeMatch) {
      const t = unescapeStr(typeMatch[1]!).toLowerCase();
      if (["character", "persona", "lorebook", "chat", "preset"].includes(t)) {
        cmd.fetchType = t as FetchCommand["fetchType"];
      }
    }
    const nameMatch = params.match(fv("name"));
    if (nameMatch) cmd.name = unescapeStr(nameMatch[1]!);
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(CREATE_LOREBOOK_RE)) {
    const params = match[1]!;
    const cmd: CreateLorebookCommand = { type: "create_lorebook", name: "" };
    const nameMatch = params.match(fv("name"));
    if (nameMatch) cmd.name = unescapeStr(nameMatch[1]!);
    const descMatch = params.match(fv("description"));
    if (descMatch) cmd.description = unescapeStr(descMatch[1]!);
    const catMatch = params.match(fv("category"));
    if (catMatch) cmd.category = unescapeStr(catMatch[1]!);
    if (cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(CREATE_LOREBOOK_ENTRY_RE)) {
    const params = match[1]!;
    const cmd: CreateLorebookEntryCommand = { type: "create_lorebook_entry", lorebook: "", name: "" };
    const lbMatch = params.match(fv("lorebook"));
    if (lbMatch) cmd.lorebook = unescapeStr(lbMatch[1]!);
    const nameMatch = params.match(fv("name"));
    if (nameMatch) cmd.name = unescapeStr(nameMatch[1]!);
    const contentMatch = params.match(fv("content"));
    if (contentMatch) cmd.content = unescapeStr(contentMatch[1]!);
    const keysMatch = params.match(fv("keys"));
    if (keysMatch) cmd.keys = unescapeStr(keysMatch[1]!);
    const tagMatch = params.match(fv("tag"));
    if (tagMatch) cmd.tag = unescapeStr(tagMatch[1]!);
    if (cmd.lorebook && cmd.name) commands.push(cmd);
  }

  for (const match of content.matchAll(UPDATE_LOREBOOK_ENTRY_RE)) {
    const params = match[1]!;
    const cmd: UpdateLorebookEntryCommand = { type: "update_lorebook_entry", lorebook: "", entryName: "" };
    const lbMatch = params.match(fv("lorebook"));
    if (lbMatch) cmd.lorebook = unescapeStr(lbMatch[1]!);
    const entryMatch = params.match(fv("entry_name"));
    if (entryMatch) cmd.entryName = unescapeStr(entryMatch[1]!);
    const contentMatch = params.match(fv("content"));
    if (contentMatch) cmd.content = unescapeStr(contentMatch[1]!);
    const keysMatch = params.match(fv("keys"));
    if (keysMatch) cmd.keys = unescapeStr(keysMatch[1]!);
    const tagMatch = params.match(fv("tag"));
    if (tagMatch) cmd.tag = unescapeStr(tagMatch[1]!);
    if (cmd.lorebook && cmd.entryName) commands.push(cmd);
  }

  // Strip all commands from the visible content
  let cleanContent = content
    .replace(SCHEDULE_UPDATE_RE, "")
    .replace(CROSS_POST_RE, "")
    .replace(SELFIE_RE, "")
    .replace(MEMORY_RE, "")
    .replace(SCENE_RE, "")
    .replace(HAPTIC_RE, "")
    .replace(INFLUENCE_RE, "")
    .replace(CREATE_PERSONA_RE, "")
    .replace(CREATE_CHARACTER_RE, "")
    .replace(UPDATE_CHARACTER_RE, "")
    .replace(UPDATE_PERSONA_RE, "")
    .replace(CREATE_CHAT_RE, "")
    .replace(NAVIGATE_RE, "")
    .replace(FETCH_RE, "")
    .replace(CREATE_LOREBOOK_RE, "")
    .replace(CREATE_LOREBOOK_ENTRY_RE, "")
    .replace(UPDATE_LOREBOOK_ENTRY_RE, "")
    .replace(/\n{3,}/g, "\n\n") // collapse excessive newlines left by removals
    .trim();

  return { cleanContent, commands };
}

/**
 * Parse a duration string like "2h", "30m", "1h30m" into minutes.
 * Returns null if unparseable.
 */
export function parseDuration(duration: string): number | null {
  const hourMatch = duration.match(/(\d+)\s*h/i);
  const minMatch = duration.match(/(\d+)\s*m/i);

  let total = 0;
  if (hourMatch) total += parseInt(hourMatch[1]!) * 60;
  if (minMatch) total += parseInt(minMatch[1]!);

  return total > 0 ? total : null;
}

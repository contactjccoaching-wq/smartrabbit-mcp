#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = "https://smartrabbit-rapidapi.contactjccoaching.workers.dev";
const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

// PubMed search queries based on fitness goals
const PUBMED_QUERIES = {
  muscle: ["muscle hypertrophy training volume", "resistance training muscle growth"],
  strength: ["strength training periodization", "maximal strength neural adaptations"],
  endurance: ["endurance training adaptations", "aerobic capacity resistance training"],
  weight_loss: ["resistance training fat loss", "high intensity interval training weight"],
  wellness: ["exercise health benefits", "resistance training quality of life"],
  definition: ["resistance training body composition", "fat loss muscle retention"]
};

const LEVEL_MODIFIERS = {
  beginner: "novice untrained",
  intermediate: "trained individuals",
  advanced: "experienced athletes"
};

// Search PubMed for scientific articles
async function searchPubMed(query, maxResults = 3) {
  try {
    // Search for article IDs
    const searchUrl = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    const ids = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return [];

    // Get article summaries
    const summaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
    const summaryResponse = await fetch(summaryUrl);
    const summaryData = await summaryResponse.json();

    const articles = [];
    for (const id of ids) {
      const article = summaryData.result?.[id];
      if (article) {
        articles.push({
          pmid: id,
          title: article.title,
          authors: article.authors?.slice(0, 3).map(a => a.name).join(", ") || "Unknown",
          journal: article.source,
          year: article.pubdate?.split(" ")[0] || "",
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
        });
      }
    }
    return articles;
  } catch (error) {
    console.error("PubMed search error:", error.message);
    return [];
  }
}

// Build search queries based on profile
function buildPubMedQueries(profile) {
  const queries = [];
  const goalQueries = PUBMED_QUERIES[profile.goal] || PUBMED_QUERIES.muscle;
  const levelMod = LEVEL_MODIFIERS[profile.level] || "";

  // Add goal-specific queries
  for (const q of goalQueries) {
    queries.push(`${q} ${levelMod}`.trim());
  }

  // Add equipment-specific query if relevant
  if (profile.equipment === "bodyweight") {
    queries.push("bodyweight exercise muscle activation");
  }

  // Add limitation-specific query if present
  if (profile.limitations) {
    if (profile.limitations.toLowerCase().includes("knee")) {
      queries.push("knee injury resistance training rehabilitation");
    }
    if (profile.limitations.toLowerCase().includes("back") || profile.limitations.toLowerCase().includes("dos")) {
      queries.push("low back pain resistance exercise");
    }
    if (profile.limitations.toLowerCase().includes("shoulder") || profile.limitations.toLowerCase().includes("épaule")) {
      queries.push("shoulder injury exercise modification");
    }
  }

  return queries.slice(0, 3); // Limit to 3 queries
}

// Format PubMed results for prompt
function formatPubMedReferences(articles) {
  if (articles.length === 0) return "";

  let text = "\n\n📚 SCIENTIFIC REFERENCES (PubMed):\n";
  text += "Use these studies to support your justifications:\n\n";

  for (const article of articles) {
    text += `• ${article.title}\n`;
    text += `  ${article.authors} (${article.year}) - ${article.journal}\n`;
    text += `  PMID: ${article.pmid} | ${article.url}\n\n`;
  }

  text += "Cite relevant findings from these studies in your physiological and neuromuscular justifications.\n";

  return text;
}

// Create MCP server
const server = new Server(
  {
    name: "Smart Rabbit Fitness",
    version: "1.6.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_fitness_program",
        description: `Generate a personalized fitness program using Smart Rabbit AI.

This tool creates a complete workout program based on the user's profile including:
- Weekly training schedule with all exercises
- Sets, reps, tempo, and rest times
- 6-week progression plan
- Scientific justifications
- Safety notes based on limitations

Two output formats available:
- "text": Plain text with Unicode formatting (default, works everywhere)
- "react": Interactive React component with tabs, colors by goal, dark theme (for Claude.ai artifacts)

After generating the program, Claude is instructed to use its web search tool to find relevant PubMed studies to enrich the justifications.`,
        inputSchema: {
          type: "object",
          properties: {
            format: {
              type: "string",
              description: "Output format: 'text' for plain text (default), 'react' for interactive React artifact with Tailwind UI",
              enum: ["text", "react"],
              default: "text"
            },
            age: {
              type: "number",
              description: "User's age (14-80)",
              minimum: 14,
              maximum: 80
            },
            sex: {
              type: "string",
              description: "Biological sex",
              enum: ["male", "female"]
            },
            level: {
              type: "string",
              description: "Fitness experience level",
              enum: ["beginner", "intermediate", "advanced"]
            },
            condition: {
              type: "string",
              description: "Current physical condition (optional)",
              enum: ["sedentary", "light", "moderate", "active", "athletic"]
            },
            sessions: {
              type: "number",
              description: "Training sessions per week (2-6)",
              minimum: 2,
              maximum: 6
            },
            duration: {
              type: "number",
              description: "Session duration in minutes",
              enum: [30, 45, 60, 75, 90]
            },
            equipment: {
              type: "string",
              description: "Available equipment",
              enum: ["bodyweight", "minimal", "home_gym", "full_gym"]
            },
            style: {
              type: "string",
              description: "Training style preference (optional)",
              enum: ["hybrid", "bodybuilding", "powerlifting", "crossfit", "calisthenics", "functional"]
            },
            goal: {
              type: "string",
              description: "Primary fitness goal",
              enum: ["muscle", "strength", "endurance", "weight_loss", "wellness", "definition"]
            },
            preferences: {
              type: "string",
              description: "Exercise preferences, favorite equipment, training style (max 500 chars)",
              maxLength: 500
            },
            limitations: {
              type: "string",
              description: "Injuries, physical limitations, exercises to avoid (max 500 chars)",
              maxLength: 500
            },
            include_pubmed: {
              type: "boolean",
              description: "Include PubMed scientific references (default: true)",
              default: true
            }
          },
          required: ["age", "sex", "level", "sessions", "duration", "equipment", "goal"]
        }
      },
      {
        name: "search_pubmed",
        description: `Search PubMed for scientific studies related to fitness and training.

Returns relevant research articles with:
- Title, authors, journal, year
- PubMed ID (PMID)
- Direct link to the article

Useful for finding evidence-based information about:
- Training methods and periodization
- Exercise physiology
- Injury prevention and rehabilitation
- Nutrition and performance`,
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search terms (e.g., 'hypertrophy training volume', 'HIIT fat loss')"
            },
            max_results: {
              type: "number",
              description: "Maximum number of results (1-10, default: 5)",
              minimum: 1,
              maximum: 10,
              default: 5
            }
          },
          required: ["query"]
        }
      },
      {
        name: "get_program_options",
        description: "Get all available options for fitness program parameters (goals, equipment, styles, etc.)",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "generate_fitness_program") {
    try {
      const outputFormat = args.format || "text";
      const endpoint = outputFormat === "react" ? "/generate" : "/generate-text";

      // Get the base prompt from API
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(args)
      });

      const data = await response.json();

      if (!data.success) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${data.error}\n\nRequired fields: ${data.required?.join(", ") || "age, sex, level, sessions, duration, equipment, goal"}`
            }
          ]
        };
      }

      let finalPrompt = "";

      // Check for missing optional but important fields
      const missingFields = [];
      if (!args.preferences) missingFields.push("preferences");
      if (!args.limitations) missingFields.push("limitations");
      if (!args.condition) missingFields.push("condition");

      if (missingFields.length > 0) {
        finalPrompt += `<STOP>
⛔ ARRÊTE-TOI ICI - NE GÉNÈRE PAS LE PROGRAMME ⛔

Il manque des informations ESSENTIELLES pour créer un programme personnalisé et sécuritaire.
Tu DOIS poser ces questions MAINTENANT, AVANT toute génération.

QUESTIONS OBLIGATOIRES À POSER:
${!args.preferences ? `→ PRÉFÉRENCES: "As-tu des préférences d'exercices ? (exercices favoris, équipement préféré, style d'entraînement, activités complémentaires comme course/vélo/natation...)"` : ""}
${!args.limitations ? `→ LIMITATIONS: "As-tu des limitations physiques ou blessures à prendre en compte ? (douleurs articulaires, anciennes blessures, exercices à éviter...)"` : ""}
${!args.condition ? `→ CONDITION: "Quelle est ta condition physique actuelle ? (sédentaire, légèrement actif, modéré, actif, athlétique)"` : ""}

RÈGLES STRICTES:
1. Pose ces questions en UN SEUL message conversationnel
2. ATTENDS la réponse de l'utilisateur
3. NE GÉNÈRE RIEN tant que l'utilisateur n'a pas répondu
4. Si l'utilisateur dit "aucune" ou "rien", c'est OK - génère ensuite le programme

⛔ SI TU GÉNÈRES LE PROGRAMME SANS POSER CES QUESTIONS, LE PROGRAMME SERA INCOMPLET ET POTENTIELLEMENT DANGEREUX ⛔
</STOP>

`;
      }

      finalPrompt += data.prompt;

      // Add PubMed as REQUIRED part of the output structure
      if (args.include_pubmed !== false) {
        const goal = args.goal || "muscle";
        const level = args.level || "intermediate";

        const goalQuery = {
          muscle: "hypertrophy training volume",
          strength: "strength training periodization",
          endurance: "endurance training adaptations",
          weight_loss: "resistance training fat loss",
          wellness: "exercise health benefits",
          definition: "body composition resistance training"
        }[goal] || "resistance training";

        const pubmedSection = outputFormat === "react"
          ? `📚 RÉFÉRENCES SCIENTIFIQUES (intégrées dans la section Justifications du composant React)`
          : `═══════════════════════════════════════════════════════════
📚 RÉFÉRENCES SCIENTIFIQUES
═══════════════════════════════════════════════════════════
• Auteur et al. (Année) - Résultat clé
  https://pubmed.ncbi.nlm.nih.gov/PMID/`;

        // Prepend to make it a core requirement, not an afterthought
        finalPrompt = `<workflow>
<critical>
CE PROGRAMME N'EST PAS COMPLET SANS RÉFÉRENCES SCIENTIFIQUES.
Tu DOIS faire une recherche PubMed AVANT de rédiger ta réponse finale.
</critical>

<execution_order>
1. D'ABORD: Utilise WebSearch pour chercher sur PubMed:
   - site:pubmed.ncbi.nlm.nih.gov ${goalQuery}
   - site:pubmed.ncbi.nlm.nih.gov ${level} resistance training

2. ENSUITE: Génère le programme complet avec les références intégrées dans les justifications.
</execution_order>

<output_structure>
Le programme DOIT contenir une section:
${pubmedSection}

Sans cette section, le programme est INCOMPLET.
</output_structure>

<output_format>${outputFormat === "react" ? "REACT ARTIFACT (application/vnd.ant.react) avec interface interactive, onglets, couleurs par objectif, thème sombre." : "TEXTE BRUT avec formatage Unicode (═ ─ ├ └ ┌ ┐ │)."}</output_format>
</workflow>

` + finalPrompt;
      }

      return {
        content: [
          {
            type: "text",
            text: finalPrompt
          }
        ]
      };

    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error calling Smart Rabbit API: ${error.message}`
          }
        ]
      };
    }
  }

  if (name === "search_pubmed") {
    try {
      const maxResults = args.max_results || 5;
      const articles = await searchPubMed(args.query, maxResults);

      if (articles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No PubMed results found for: "${args.query}"\n\nTry different search terms or broader keywords.`
            }
          ]
        };
      }

      let text = `📚 PubMed Search Results for: "${args.query}"\n`;
      text += `Found ${articles.length} article(s):\n\n`;

      for (const article of articles) {
        text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        text += `📄 ${article.title}\n`;
        text += `👤 ${article.authors}\n`;
        text += `📰 ${article.journal} (${article.year})\n`;
        text += `🔗 PMID: ${article.pmid}\n`;
        text += `   ${article.url}\n\n`;
      }

      return {
        content: [
          {
            type: "text",
            text
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching PubMed: ${error.message}`
          }
        ]
      };
    }
  }

  if (name === "get_program_options") {
    return {
      content: [
        {
          type: "text",
          text: `Smart Rabbit Fitness - Available Options:

OUTPUT FORMATS:
- text: Plain text with Unicode formatting (default, works everywhere)
- react: Interactive React artifact with Tailwind UI, tabs, dark theme, colors by goal

GOALS:
- muscle: Build muscle mass
- strength: Increase strength
- endurance: Improve endurance
- weight_loss: Lose weight
- wellness: General wellness
- definition: Muscle definition/cutting

EQUIPMENT:
- bodyweight: No equipment
- minimal: Dumbbells, resistance bands
- home_gym: Home gym setup
- full_gym: Full commercial gym

LEVELS:
- beginner: New to training
- intermediate: 1-3 years experience
- advanced: 3+ years experience

STYLES:
- hybrid: Mix of styles (default)
- bodybuilding: Hypertrophy focused
- powerlifting: Strength focused
- crossfit: High intensity functional
- calisthenics: Bodyweight mastery
- functional: Functional fitness

SESSION DURATIONS: 30, 45, 60, 75, 90 minutes
SESSIONS PER WEEK: 2-6

FEATURES:
- PubMed integration: Scientific references are automatically included
- Use search_pubmed tool for custom research queries
- React format: Interactive component with Program/Justifications tabs, priority system, color-coded by goal`
        }
      ]
    };
  }

  return {
    content: [
      {
        type: "text",
        text: `Unknown tool: ${name}`
      }
    ]
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🐰 Smart Rabbit Fitness MCP v1.6.0 ready (text + react formats)");
}

main().catch(console.error);

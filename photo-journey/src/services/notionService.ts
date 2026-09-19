import { CustomMission } from '../types';

export interface NotionSyncResult {
  success: boolean;
  message: string;
  pageUrl?: string;
}

const NOTION_VERSION = '2022-06-28';

/**
 * Clean Notion Database ID string (removes dashes, spaces, and URL parameters)
 */
export function cleanNotionDatabaseId(rawId: string): string {
  if (!rawId) return '';
  let id = rawId.trim();

  // If a full Notion URL is pasted (e.g. https://www.notion.so/workspace/32charid?v=...)
  if (id.includes('notion.so') || id.includes('notion.site')) {
    const parts = id.split('?')[0].split('/');
    id = parts[parts.length - 1];
  }

  // Remove all hyphens
  id = id.replace(/-/g, '');
  return id;
}

/**
 * Tests connection to the user's Notion database
 */
export async function testNotionConnection(apiKey: string, rawDatabaseId: string): Promise<NotionSyncResult> {
  const databaseId = cleanNotionDatabaseId(rawDatabaseId);

  if (!apiKey || !apiKey.startsWith('secret_')) {
    return {
      success: false,
      message: 'Invalid Integration Secret. Notion tokens must start with "secret_".'
    };
  }

  if (!databaseId || databaseId.length !== 32) {
    return {
      success: false,
      message: 'Invalid Database ID. Notion Database IDs are 32 hexadecimal characters.'
    };
  }

  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const dbTitle = data.title?.[0]?.plain_text || 'Connected Database';
      return {
        success: true,
        message: `Successfully connected to Notion Database: "${dbTitle}"!`
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        message: `Notion API Error (${res.status}): ${errData.message || res.statusText}. Make sure you added your integration to the database via Notion's "..." menu!`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Network Connection Error: ${err.message || err}. Note: If your browser blocks CORS to Notion API, you can also use our instant Copy Markdown & CSV options!`
    };
  }
}

/**
 * Pushes a CustomMission to the Notion database as a new page with rich blocks
 */
export function buildNotionPagePayload(databaseId: string, mission: CustomMission) {
  const stars = Array.from({ length: mission.difficultyStars }).map(() => '★').join('');

  // Children blocks (Page Content)
  const children: any[] = [
    {
      object: 'block',
      type: 'callout',
      callout: {
        rich_text: [
          {
            type: 'text',
            text: {
              content: `Expedition: ${mission.expeditionName} | Time: ${mission.estimatedTime} | Difficulty: ${stars}`
            }
          }
        ],
        icon: { emoji: '📸' },
        color: 'amber_background'
      }
    },
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '🎯 Objective & Overview' } }]
      }
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: mission.objective } }]
      }
    },
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '🎒 Gear & Shooting Setup' } }]
      }
    },
    {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [
          { type: 'text', text: { content: 'Gear Needed: ', annotations: { bold: true } } },
          { type: 'text', text: { content: mission.gearNeeded } }
        ]
      }
    },
    {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [
          { type: 'text', text: { content: 'Camera Setup: ', annotations: { bold: true } } },
          { type: 'text', text: { content: mission.cameraSetup } }
        ]
      }
    }
  ];

  if (mission.flashSetup) {
    children.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        rich_text: [
          { type: 'text', text: { content: 'Flash Setup: ', annotations: { bold: true } } },
          { type: 'text', text: { content: mission.flashSetup } }
        ]
      }
    });
  }

  // Steps as interactive Checkboxes in Notion
  if (mission.steps && mission.steps.length > 0) {
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📋 Field Action Checklist' } }]
      }
    });

    mission.steps.forEach(step => {
      let stepText = `${step.title}: ${step.instruction}`;
      if (step.tryValues) stepText += ` (Try: ${step.tryValues})`;

      children.push({
        object: 'block',
        type: 'to_do',
        to_do: {
          rich_text: [{ type: 'text', text: { content: stepText } }],
          checked: false
        }
      });
    });
  }

  // Field notes
  if (mission.fieldNotes && mission.fieldNotes.length > 0) {
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📝 Field Notes' } }]
      }
    });

    mission.fieldNotes.forEach(note => {
      children.push({
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: {
          rich_text: [{ type: 'text', text: { content: note } }]
        }
      });
    });
  }

  return {
    parent: { database_id: databaseId },
    properties: {
      Name: {
        title: [
          {
            text: { content: mission.title }
          }
        ]
      }
    },
    children
  };
}

/**
 * Sends a CustomMission to the user's Notion database via the REST API
 */
export async function pushMissionToNotion(apiKey: string, rawDatabaseId: string, mission: CustomMission): Promise<NotionSyncResult> {
  const databaseId = cleanNotionDatabaseId(rawDatabaseId);

  if (!apiKey || !databaseId) {
    return {
      success: false,
      message: 'Please configure your Notion API Key and Database ID in Settings first.'
    };
  }

  try {
    const payload = buildNotionPagePayload(databaseId, mission);

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: `Mission "${mission.title}" successfully synced to Notion!`,
        pageUrl: data.url
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      return {
        success: false,
        message: `Notion API Error (${res.status}): ${errData.message || res.statusText}`
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to connect to Notion: ${err.message || err}`
    };
  }
}

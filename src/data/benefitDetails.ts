/**
 * The pictures and prose shown beside each community benefit.
 *
 * Moved out of CommunityView on 31 October 2026 so it can be checked. It is
 * plain data with no UI in it, and it was the one benefit registry that no
 * test could reach, because importing a React component into a node script
 * pulls in the whole rendering stack. The registry check in
 * scripts/check-air-campus.ts now asserts that every benefit has an entry
 * here, which is the generalisation of the bug that left the haul fleet
 * unelectrifiable: a benefit missing from one of its registries, in silence.
 */

import type { CommunityBenefitId } from './communityBenefits';

export const BENEFIT_DETAILS: Record<
  CommunityBenefitId,
  { image: string; description: string }
> = {
  canoe: {
    image: '/canoe.png',
    description:
      'Repurposed sections of underground aquifers or water tunnels can be safely adapted for guided canoeing and educational tourism. This creates a unique attraction tied to local geology and mining heritage, supporting tourism operators, guides, and small businesses while increasing public engagement with subsurface water systems.',
  },
  irrigation: {
    image: '/irrigation.png',
    description:
      'Investment in modern irrigation infrastructure such as smart valves, sensors, and recycled water loops can reduce overall water consumption while improving crop yields. Local farmers benefit from more reliable water access, lower operating costs, and improved resilience to drought conditions.',
  },
  workforce: {
    image: '/research.png',
    description:
      'Workforce training linked to advanced manufacturing and mining operations can support universities and technical institutes through long-term programs focused on engineering, environmental monitoring, and industrial skills. This strengthens local academic capacity, creates career pathways, and anchors knowledge generation in the region.',
  },
  energy_storage: {
    image: '/energy.png',
    description:
      'Subsurface spaces and supporting infrastructure can be used for pilot-scale hydrogen or energy storage research programs. This enables industrial partners to test low-carbon energy systems locally, attract clean energy investment, and create skilled jobs tied to future energy markets.',
  },
  park: {
    image: '/parks.png',
    description:
      'Designated land buffers and post-operation areas can be converted into protected parks, reforestation zones, or biodiversity corridors. Environmental organizations gain long-term stewardship roles, enabling conservation, habitat restoration, and educational outreach while improving regional ecological outcomes.',
  },
};

import ParamSelect from "@/components/shared/param-select";

/**
 * The campaign type a page counts (Sean, Nov 2026, phase 4): Insurance to begin with, a campaign type, or all of them.
 * `campaign`: readCampaign(). Nothing before there are campaign types.
 */
export default function CampaignPicker({ campaign, clears = ["page"] }) {
  if (!campaign) return null;
  return (
    <span data-campaign-picker>
      <ParamSelect name="ct" label="Campaign type" placeholder="Insurance" value={campaign.param} options={campaign.options} clears={clears} />
    </span>
  );
}

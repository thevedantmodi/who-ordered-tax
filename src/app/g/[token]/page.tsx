import { notFound } from "next/navigation";
import { loadGroup } from "@/lib/groups";
import { AutoRefresh } from "@/components/AutoRefresh";
import {
  GroupActivity,
  GroupAddExpense,
  GroupHeader,
  GroupJoinGate,
  GroupMembers,
  GroupSettings,
  GroupShareCard,
  SettleUp,
} from "@/components/GroupView";

export const metadata = { title: "Group", robots: { index: false } };

export default async function GroupPage({ params }: PageProps<"/g/[token]">) {
  const { token } = await params;
  const group = await loadGroup({ shareToken: token });
  if (!group) notFound();

  if (!group.viewer.memberId) {
    return (
      <div className="space-y-6">
        <AutoRefresh />
        <GroupJoinGate group={group} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <GroupHeader group={group} />
      <SettleUp group={group} />
      <GroupAddExpense group={group} />
      <GroupActivity group={group} />
      <GroupMembers group={group} />
      <GroupShareCard group={group} />
      <GroupSettings group={group} />
    </div>
  );
}

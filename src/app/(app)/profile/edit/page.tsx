import type { Metadata } from "next";
import { ProfileEdit } from "@/components/profile/profile-edit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit Profile",
};

export default function ProfileEditPage() {
  return <ProfileEdit />;
}

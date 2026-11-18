import type { User } from "../api";

/** Your profile picture, or the first letter of your email when there isn't one. */
export function Avatar({ user, className = "avatar" }: { user: User; className?: string }) {
  return user.avatar_url ? (
    <img className={`${className} avatar-img`} src={user.avatar_url} alt="" />
  ) : (
    <span className={className} aria-hidden="true">
      {user.email.charAt(0).toUpperCase()}
    </span>
  );
}

"use client";

/**
 * Which conversation is on screen, so the bell can stay quiet about messages
 * the user is already reading. One per browser tab.
 */
let current = null;

export const setActiveChat = (userId) => {
  current = userId ?? null;
};

export const isActiveChat = (userId) => current !== null && current === userId;

/** Tell the bell its counts are stale (something was marked read elsewhere). */
export const NOTIFICATIONS_CHANGED = "lighthouse:notifications-changed";
export const announceNotificationsChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

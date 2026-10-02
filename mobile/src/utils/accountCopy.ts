import type { DataCounts } from '../services/account';

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const describeCounts = (counts: DataCounts): string =>
  `${plural(counts.roadmaps, 'roadmap')} and ${plural(counts.bullets, 'CV bullet')}`;

/** The three alerts of the "account already has data" choice. */
export const conflictCopy = (cloud: DataCounts, device: DataCounts) => ({
  choose: {
    title: 'This Google account already has data',
    message: `In your account: ${describeCounts(cloud)}.\nOn this phone: ${describeCounts(device)}.\n\nChoose which to keep. Nothing is removed until you confirm.`,
  },
  confirmCloud: {
    title: "Remove this phone's data?",
    message: `This phone's ${describeCounts(device)} will be deleted and replaced with your account's. This can't be undone.`,
    action: "Remove this phone's data",
  },
  confirmDevice: {
    title: "Replace your account's data?",
    message: `Your account's ${describeCounts(cloud)} will be deleted on every device and replaced with this phone's. This can't be undone.`,
    action: "Replace account's data",
  },
});

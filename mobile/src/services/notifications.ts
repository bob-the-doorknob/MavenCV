export interface NotificationCapability {
  status: 'not_configured';
  detail: string;
}

export const notificationCapability: NotificationCapability = {
  status: 'not_configured',
  detail: 'Notification scheduling is deferred to a later implementation phase.',
};

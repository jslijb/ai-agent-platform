export interface SaaSApprovalParams {
  approvalCode: string;
  userId: string;
  formData: Array<{
    control: string;
    value: Array<{ key: string; value: string | number }>;
  }>;
}

export interface SaaSNotificationParams {
  userIds: string[];
  title: string;
  content: string;
}

export interface SaaSCalendarParams {
  userId: string;
  summary: string;
  startTime: string;
  endTime: string;
  description?: string;
}

export interface SaaSApprovalResult {
  success: boolean;
  instanceId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SaaSNotificationResult {
  success: boolean;
  messageIds?: string[];
  errorCode?: string;
  errorMessage?: string;
}

export interface SaaSCalendarResult {
  success: boolean;
  eventId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export abstract class SaaSChannelAdapter {
  abstract readonly platform: string;
  abstract submitApproval(params: SaaSApprovalParams): Promise<SaaSApprovalResult>;
  abstract sendNotification(params: SaaSNotificationParams): Promise<SaaSNotificationResult>;
  abstract createCalendarEvent(params: SaaSCalendarParams): Promise<SaaSCalendarResult>;
  abstract healthCheck(): Promise<boolean>;
}
export type ActorContext = {
  actorId: string;
  roles: readonly string[];
  authenticated: boolean;
};

export type RequestContext = {
  requestId: string;
  correlationId: string;
  actor: ActorContext;
};

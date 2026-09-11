import type { ReqType } from "@/lib/generated/selectInp";

export type BackendRequest = ReqType;

export type BackendService = keyof BackendRequest;

export type BackendModel<TService extends BackendService = BackendService> =
  keyof BackendRequest[TService];

export type BackendAct<
  TService extends BackendService,
  TModel extends keyof BackendRequest[TService],
> = keyof BackendRequest[TService][TModel];

export type BackendActRequest<
  TService extends BackendService,
  TModel extends keyof BackendRequest[TService],
  TAct extends keyof BackendRequest[TService][TModel],
> = {
  service?: TService;
  model: TModel;
  act: TAct;
  details: BackendRequest[TService][TModel][TAct];
};

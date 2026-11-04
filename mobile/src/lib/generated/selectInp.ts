
/* eslint-disable */

  
    export type userInp = {
      
      tracks?: number | trackInp
sessions?: number | playbackSessionInp
annotations?: number | annotationInp
playlists?: number | playlistInp
playbackContexts?: number | playbackContextInp
onlineCollections?: number | onlineCollectionInp
subscriptions?: number | subscriptionInp
aiUsage?: number | aiUsageInp
    }


    export type userSchema = {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
setting?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
role: ("user" | "admin" | "support" );
status: ("active" | "suspended" | "deleted" );
suspendedAt?: number;
suspendedReason?: string;
createdAt?: Date;
updatedAt?: Date;
tracks: {
_id?: string;
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
totalPlayCount: number;
totalListenTimeSec: number;
lastPlayedAt?: number;
origin: string;
sourceId?: string;
externalId?: string;
collectionKey?: string;
collectionTitle?: string;
downloadedAt?: number;
createdAt?: Date;
updatedAt?: Date;
}[];
sessions: {
_id?: string;
clientId?: string;
contentHash?: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
deviceInfo?: string;
contextPlayId?: string;
contextType?: string;
contextKey?: string;
stretchId?: string;
seeked: boolean;
createdAt?: Date;
updatedAt?: Date;
}[];
annotations: {
_id?: string;
clientId?: string;
positionSec: number;
text: string;
tags: string[];
color?: string;
timesPlayedBefore: number;
createdAt?: Date;
updatedAt?: Date;
}[];
playlists: {
_id?: string;
clientId?: string;
title: string;
description?: string;
isPublic: boolean;
items: {
trackId: string;
order: number;
}[];
createdAt?: Date;
updatedAt?: Date;
}[];
playbackContexts: {
_id?: string;
clientId?: string;
contextType: string;
contextKey: string;
contextTitle: string;
trackCount: number;
startedAt: number;
endedAt?: number;
lastIndex: number;
lastTrackId?: string;
lastPositionSec: number;
listenedSec: number;
finishedCount: number;
completed: boolean;
interrupted: boolean;
createdAt?: Date;
updatedAt?: Date;
}[];
onlineCollections: {
_id?: string;
clientId?: string;
sourceId: string;
externalId: string;
title: string;
subtitle?: string;
artworkUrl?: string;
languageCode: string;
trackCount: number;
pageUrl?: string;
isFavorite: boolean;
lastOpenedAt?: number;
deletedAt?: number;
createdAt?: Date;
updatedAt?: Date;
}[];
subscriptions: {
_id?: string;
planCode: string;
status: ("active" | "trialing" | "past_due" | "canceled" | "expired" );
startedAt: number;
currentPeriodStart: number;
currentPeriodEnd?: number;
cancelAtPeriodEnd: boolean;
canceledAt?: number;
provider: string;
providerRef?: string;
autoRenew: boolean;
note?: string;
grantMode?: ("forever" | "duration" | "usage" );
usageCaps?: {
historyEntries?: number;
playlists?: number;
maxTracks?: number;
};
createdAt?: Date;
updatedAt?: Date;
}[];
aiUsage: {
_id?: string;
periodKey: string;
creditsUsed: number;
bonusCredits: number;
requestCount: number;
lastUsedAt?: number;
createdAt?: Date;
updatedAt?: Date;
}[];
};
;


    export type trackInp = {
      user?: number | userInp
      sessions?: number | playbackSessionInp
annotations?: number | annotationInp
    }


    export type trackSchema = {
_id?: string;
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
totalPlayCount: number;
totalListenTimeSec: number;
lastPlayedAt?: number;
origin: string;
sourceId?: string;
externalId?: string;
collectionKey?: string;
collectionTitle?: string;
downloadedAt?: number;
createdAt?: Date;
updatedAt?: Date;
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
setting?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
role: ("user" | "admin" | "support" );
status: ("active" | "suspended" | "deleted" );
suspendedAt?: number;
suspendedReason?: string;
};
sessions: {
_id?: string;
clientId?: string;
contentHash?: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
deviceInfo?: string;
contextPlayId?: string;
contextType?: string;
contextKey?: string;
stretchId?: string;
seeked: boolean;
createdAt?: Date;
updatedAt?: Date;
}[];
annotations: {
_id?: string;
clientId?: string;
positionSec: number;
text: string;
tags: string[];
color?: string;
timesPlayedBefore: number;
createdAt?: Date;
updatedAt?: Date;
}[];
};
;


    export type playbackSessionInp = {
      track?: number | trackInp
user?: number | userInp
      
    }


    export type playbackSessionSchema = {
_id?: string;
clientId?: string;
contentHash?: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
deviceInfo?: string;
contextPlayId?: string;
contextType?: string;
contextKey?: string;
stretchId?: string;
seeked: boolean;
createdAt?: Date;
updatedAt?: Date;
track: {
_id?: string;
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
totalPlayCount: number;
totalListenTimeSec: number;
lastPlayedAt?: number;
origin: string;
sourceId?: string;
externalId?: string;
collectionKey?: string;
collectionTitle?: string;
downloadedAt?: number;
};
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
setting?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
role: ("user" | "admin" | "support" );
status: ("active" | "suspended" | "deleted" );
suspendedAt?: number;
suspendedReason?: string;
};
};
;


    export type annotationInp = {
      track?: number | trackInp
user?: number | userInp
session?: number | playbackSessionInp
      
    }


    export type annotationSchema = {
_id?: string;
clientId?: string;
positionSec: number;
text: string;
tags: string[];
color?: string;
timesPlayedBefore: number;
createdAt?: Date;
updatedAt?: Date;
track: {
_id?: string;
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
totalPlayCount: number;
totalListenTimeSec: number;
lastPlayedAt?: number;
origin: string;
sourceId?: string;
externalId?: string;
collectionKey?: string;
collectionTitle?: string;
downloadedAt?: number;
};
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
setting?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
role: ("user" | "admin" | "support" );
status: ("active" | "suspended" | "deleted" );
suspendedAt?: number;
suspendedReason?: string;
};
session?: {
_id?: string;
clientId?: string;
contentHash?: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
contextPlayId?: string;
contextType?: string;
contextKey?: string;
stretchId?: string;
seeked: boolean;
};
};
;


    export type playlistInp = {
      user?: number | userInp
      
    }


    export type playlistSchema = {
_id?: string;
clientId?: string;
title: string;
description?: string;
isPublic: boolean;
items: {
trackId: string;
order: number;
}[];
createdAt?: Date;
updatedAt?: Date;
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
setting?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
role: ("user" | "admin" | "support" );
status: ("active" | "suspended" | "deleted" );
suspendedAt?: number;
suspendedReason?: string;
};
};
;


    export type playbackContextInp = {
      user?: number | userInp
      
    }


    export type playbackContextSchema = {
_id?: string;
clientId?: string;
contextType: string;
contextKey: string;
contextTitle: string;
trackCount: number;
startedAt: number;
endedAt?: number;
lastIndex: number;
lastTrackId?: string;
lastPositionSec: number;
listenedSec: number;
finishedCount: number;
completed: boolean;
interrupted: boolean;
createdAt?: Date;
updatedAt?: Date;
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
setting?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
role: ("user" | "admin" | "support" );
status: ("active" | "suspended" | "deleted" );
suspendedAt?: number;
suspendedReason?: string;
};
};
;


    export type onlineCollectionInp = {
      user?: number | userInp
      
    }


    export type onlineCollectionSchema = {
_id?: string;
clientId?: string;
sourceId: string;
externalId: string;
title: string;
subtitle?: string;
artworkUrl?: string;
languageCode: string;
trackCount: number;
pageUrl?: string;
isFavorite: boolean;
lastOpenedAt?: number;
deletedAt?: number;
createdAt?: Date;
updatedAt?: Date;
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
setting?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
role: ("user" | "admin" | "support" );
status: ("active" | "suspended" | "deleted" );
suspendedAt?: number;
suspendedReason?: string;
};
};
;


    export type planInp = {
      
      
    }


    export type planSchema = {
_id?: string;
code: string;
title: string;
description?: string;
priceCents: number;
currency: string;
billingInterval: ("month" | "year" | "lifetime" );
isActive: boolean;
isDefault: boolean;
sortOrder: number;
limits: {
historyEntries: number;
crossDeviceSync: boolean;
playlists: number;
maxTracks: number;
aiCreditsPerMonth: number;
};
features: string[];
createdAt?: Date;
updatedAt?: Date;
};
;


    export type subscriptionInp = {
      user?: number | userInp
      
    }


    export type subscriptionSchema = {
_id?: string;
planCode: string;
status: ("active" | "trialing" | "past_due" | "canceled" | "expired" );
startedAt: number;
currentPeriodStart: number;
currentPeriodEnd?: number;
cancelAtPeriodEnd: boolean;
canceledAt?: number;
provider: string;
providerRef?: string;
autoRenew: boolean;
note?: string;
grantMode?: ("forever" | "duration" | "usage" );
usageCaps?: {
historyEntries?: number;
playlists?: number;
maxTracks?: number;
};
createdAt?: Date;
updatedAt?: Date;
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
setting?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
role: ("user" | "admin" | "support" );
status: ("active" | "suspended" | "deleted" );
suspendedAt?: number;
suspendedReason?: string;
};
};
;


    export type billingTransactionInp = {
      
      
    }


    export type billingTransactionSchema = {
_id?: string;
reference: string;
userId: string;
userEmail?: string;
planCode: string;
planTitle?: string;
amountCents: number;
currency: string;
billingInterval: string;
status: ("pending" | "paid" | "failed" | "refunded" | "canceled" );
provider: string;
providerRef?: string;
periodStart?: number;
periodEnd?: number;
note?: string;
metadata?: string;
paidAt?: number;
refundedAt?: number;
createdAt?: Date;
updatedAt?: Date;
};
;


    export type aiUsageInp = {
      user?: number | userInp
      
    }


    export type aiUsageSchema = {
_id?: string;
periodKey: string;
creditsUsed: number;
bonusCredits: number;
requestCount: number;
lastUsedAt?: number;
createdAt?: Date;
updatedAt?: Date;
user: {
_id?: string;
username: string;
email: string;
displayName?: string;
avatarUrl?: string;
setting?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
role: ("user" | "admin" | "support" );
status: ("active" | "suspended" | "deleted" );
suspendedAt?: number;
suspendedReason?: string;
};
};
;


    export type adminAuditLogInp = {
      
      
    }


    export type adminAuditLogSchema = {
_id?: string;
actorId: string;
actorEmail?: string;
actorRole?: string;
action: string;
targetType: string;
targetId?: string;
summary?: string;
metadata?: string;
createdAt?: Date;
updatedAt?: Date;
};
;


    export type platformSettingInp = {
      
      
    }


    export type platformSettingSchema = {
_id?: string;
key: string;
signupsEnabled: boolean;
aiEnabled: boolean;
maintenanceMode: boolean;
announcement?: string;
createdAt?: Date;
updatedAt?: Date;
};
;


    export type ReqType = {

  
        main: {

      
        user: {

      
            register: {
set: {
username: string;
email: string;
password: string;
displayName?: string;
};
get?: {
token?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
            login: {
set: {
email: string;
password: string;
};
get?: {
token?: (0 | 1 );
user: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
            getMe: {
set: {
};
get: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
};
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
};
};

          
            getMySettings: {
set: {
};
get: {
languageCode?: (0 | 1 );
defaultSpeed?: (0 | 1 );
historySort?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};

          
            updateMySettings: {
set: {
languageCode?: string;
defaultSpeed?: number;
historySort?: ("newest" | "oldest" | "longest" );
updatedAt?: number;
};
get: {
languageCode?: (0 | 1 );
defaultSpeed?: (0 | 1 );
historySort?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};

          
            adminListUsers: {
set: {
page?: number;
limit?: number;
search?: string;
role?: ("user" | "admin" | "support" );
status?: ("active" | "suspended" | "deleted" );
planCode?: string;
sortBy?: ("createdAt" | "updatedAt" | "email" | "username" | "displayName" );
sortOrder?: ("asc" | "desc" );
};
get?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
setting?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};

          
            adminGetUser: {
set: {
userId: string;
sessionsLimit?: number;
};
get?: {
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
setting?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
entitlement?: {
planCode?: (0 | 1 );
planTitle?: (0 | 1 );
isPaid?: (0 | 1 );
limits?: {
historyEntries?: (0 | 1 );
crossDeviceSync?: (0 | 1 );
playlists?: (0 | 1 );
maxTracks?: (0 | 1 );
aiCreditsPerMonth?: (0 | 1 );
};
subscriptionStatus?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
autoRenew?: (0 | 1 );
startedAt?: (0 | 1 );
};
historyQuota?: {
limit?: (0 | 1 );
used?: (0 | 1 );
remaining?: (0 | 1 );
unlimited?: (0 | 1 );
};
usage?: {
sessionCount?: (0 | 1 );
listenTimeSec?: (0 | 1 );
firstActiveAt?: (0 | 1 );
lastActiveAt?: (0 | 1 );
trackCount?: (0 | 1 );
storageBytes?: (0 | 1 );
annotationCount?: (0 | 1 );
playlistCount?: (0 | 1 );
contextCount?: (0 | 1 );
onlineCollectionCount?: (0 | 1 );
};
recentSessions?: {
_id?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
durationListenedSec?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
seeked?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
track?: {
title?: (0 | 1 );
};
};
};
};

          
            adminUpdateUser: {
set: {
userId: string;
username?: string;
email?: string;
displayName?: string;
avatarUrl?: string;
role?: ("user" | "admin" | "support" );
status?: ("active" | "suspended" );
suspendedReason?: string;
};
get?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
setting?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};

          
            adminDeleteUser: {
set: {
userId: string;
confirmEmail: string;
};
get?: {
deleted?: (0 | 1 );
userId?: (0 | 1 );
purged?: (0 | 1 );
};
};

          
            adminResetUserPassword: {
set: {
userId: string;
password?: string;
};
get?: {
userId?: (0 | 1 );
password?: (0 | 1 );
generated?: (0 | 1 );
};
};

          
            adminGetUserHistory: {
set: {
userId: string;
page?: number;
limit?: number;
from?: number;
to?: number;
contentHash?: string;
};
get?: {
_id?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
};

          
          }

        
        track: {

      
            registerTrack: {
set: {
title: string;
contentHash: string;
fileName?: string;
durationSec: number;
fileSizeBytes: number;
mimeType?: string;
isAudiobook: boolean;
author?: string;
narrator?: string;
artworkUrl?: string;
origin: ("local" | "online" );
sourceId?: string;
externalId?: string;
collectionKey?: string;
collectionTitle?: string;
downloadedAt?: number;
};
get: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};

          
            getMyTracks: {
set: {
page?: number;
limit?: number;
skip?: number;
isAudiobook?: boolean;
search?: string;
sortBy?: ("createdAt" | "updatedAt" | "title" | "lastPlayedAt" );
sortOrder?: ("asc" | "desc" );
};
get: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
};
};
};
};

          
            getTrackDetail: {
set: {
trackId: string;
};
get: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
};
};
};
};

          
            syncLocalData: {
set: {
sessions?: {
clientId: string;
contentHash: string;
startedAt: number;
endedAt?: number;
startPositionSec: number;
endPositionSec: number;
durationListenedSec: number;
playbackSpeed: number;
completed: boolean;
interrupted: boolean;
deviceInfo?: string;
contextPlayId?: string;
contextType?: string;
contextKey?: string;
stretchId?: string;
seeked: boolean;
}[];
annotations?: {
clientId: string;
contentHash: string;
positionSec: number;
text: string;
tags: string[];
color?: string;
updatedAt?: number;
deleted: boolean;
}[];
playlists?: {
clientId: string;
title: string;
description?: string;
isPublic?: boolean;
items?: {
contentHash: string;
order: number;
}[];
updatedAt?: number;
deleted?: boolean;
}[];
contextPlays?: {
clientId: string;
contextType: string;
contextKey: string;
contextTitle: string;
trackCount: number;
startedAt: number;
endedAt: number;
lastIndex: number;
lastTrackId?: string;
lastPositionSec: number;
listenedSec: number;
finishedCount: number;
completed: boolean;
interrupted: boolean;
updatedAt?: number;
}[];
settings?: {
languageCode: string;
defaultSpeed: number;
historySort: ("newest" | "oldest" | "longest" );
updatedAt: number;
};
onlineCollections?: {
clientId: string;
sourceId: string;
externalId: string;
title: string;
languageCode: string;
subtitle?: string;
artworkUrl?: string;
trackCount: number;
pageUrl?: string;
isFavorite: boolean;
lastOpenedAt?: number;
updatedAt?: number;
deleted: boolean;
}[];
};
get?: {
syncedSessions?: (0 | 1 );
syncedAnnotations?: (0 | 1 );
syncedPlaylists?: (0 | 1 );
syncedContextPlays?: (0 | 1 );
syncedOnlineCollections?: (0 | 1 );
syncedSettings?: (0 | 1 );
historySkipped?: (0 | 1 );
playlistsSkipped?: (0 | 1 );
crossDeviceSync?: (0 | 1 );
historyQuota?: {
limit?: (0 | 1 );
used?: (0 | 1 );
remaining?: (0 | 1 );
unlimited?: (0 | 1 );
};
playlistsQuota?: {
limit?: (0 | 1 );
used?: (0 | 1 );
remaining?: (0 | 1 );
unlimited?: (0 | 1 );
};
settings?: {
languageCode?: (0 | 1 );
defaultSpeed?: (0 | 1 );
historySort?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
clientId?: (0 | 1 );
serverId?: (0 | 1 );
}[];
playlists?: {
clientId?: (0 | 1 );
serverId?: (0 | 1 );
}[];
contextPlays?: {
clientId?: (0 | 1 );
serverId?: (0 | 1 );
}[];
onlineCollections?: {
clientId?: (0 | 1 );
serverId?: (0 | 1 );
}[];
};
};

          
          }

        
        annotation: {

      
            updateAnnotation: {
set: {
annotationId: string;
text?: string;
tags?: string[];
color?: string;
updatedAt?: number;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
};
};
};

          
            deleteAnnotation: {
set: {
annotationId: string;
};
get?: {
success?: (0 | 1 );
};
};

          
            getMyAnnotations: {
set: {
page?: number;
limit?: number;
skip?: number;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
session?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
};
};

          
          }

        
        playbackSession: {

      
            getMyListeningHistory: {
set: {
page?: number;
limit?: number;
skip?: number;
from?: number;
to?: number;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
            getTrackSessions: {
set: {
page?: number;
limit?: number;
skip?: number;
trackId: string;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
track?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
            getMyStats: {
set: {
};
get?: {
totalListenTimeSec?: (0 | 1 );
sessionCount?: (0 | 1 );
trackCount?: (0 | 1 );
firstListenedAt?: (0 | 1 );
lastListenedAt?: (0 | 1 );
tracks?: {
contentHash?: (0 | 1 );
listenTimeSec?: (0 | 1 );
playCount?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
};
};
};

          
            adminGetOverview: {
set: {
};
get?: {
generatedAt?: (0 | 1 );
users?: {
total?: (0 | 1 );
active?: (0 | 1 );
suspended?: (0 | 1 );
newLast24h?: (0 | 1 );
newLast7d?: (0 | 1 );
newLast30d?: (0 | 1 );
};
activity?: {
activeLast24h?: (0 | 1 );
activeLast7d?: (0 | 1 );
activeLast30d?: (0 | 1 );
};
content?: {
sessions?: (0 | 1 );
listenTimeSec?: (0 | 1 );
lastSessionAt?: (0 | 1 );
tracks?: (0 | 1 );
storageBytes?: (0 | 1 );
annotations?: (0 | 1 );
playlists?: (0 | 1 );
contexts?: (0 | 1 );
onlineCollections?: (0 | 1 );
};
revenue?: {
mrrCents?: (0 | 1 );
currency?: (0 | 1 );
payingUsers?: (0 | 1 );
arpuCents?: (0 | 1 );
conversionRate?: (0 | 1 );
planDistribution?: {
planCode?: (0 | 1 );
title?: (0 | 1 );
priceCents?: (0 | 1 );
isActive?: (0 | 1 );
users?: (0 | 1 );
};
};
quota?: {
freeHistoryLimit?: (0 | 1 );
usersAtLimit?: (0 | 1 );
};
};
};

          
            adminGetTimeseries: {
set: {
days?: number;
};
get?: {
days?: {
date?: (0 | 1 );
timestamp?: (0 | 1 );
signups?: (0 | 1 );
sessions?: (0 | 1 );
listenTimeSec?: (0 | 1 );
activeUsers?: (0 | 1 );
};
from?: (0 | 1 );
to?: (0 | 1 );
};
};

          
            adminGetTopTracks: {
set: {
days?: number;
limit?: number;
};
get?: {
days?: (0 | 1 );
rows?: {
trackId?: (0 | 1 );
contentHash?: (0 | 1 );
title?: (0 | 1 );
author?: (0 | 1 );
isAudiobook?: (0 | 1 );
origin?: (0 | 1 );
listenTimeSec?: (0 | 1 );
playCount?: (0 | 1 );
listenerCount?: (0 | 1 );
};
};
};

          
            adminGetRetention: {
set: {
cohorts?: number;
weeks?: number;
};
get?: {
cohorts?: {
cohortStart?: (0 | 1 );
cohortDate?: (0 | 1 );
size?: (0 | 1 );
weeks?: {
week?: (0 | 1 );
activeUsers?: (0 | 1 );
rate?: (0 | 1 );
};
};
weeks?: (0 | 1 );
};
};

          
          }

        
        playlist: {

      
            createPlaylist: {
set: {
title: string;
description?: string;
isPublic?: boolean;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
};

          
            updatePlaylist: {
set: {
playlistId: string;
title?: string;
description?: string;
isPublic?: boolean;
items?: {
trackId: string;
order: number;
}[];
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
};

          
            deletePlaylist: {
set: {
playlistId: string;
};
get?: {
success?: (0 | 1 );
};
};

          
            getMyPlaylists: {
set: {
page?: number;
limit?: number;
skip?: number;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
};

          
          }

        
        playbackContext: {

      
            getMyPlaybackContexts: {
set: {
page?: number;
limit?: number;
skip?: number;
contextType?: string;
contextKey?: string;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
          }

        
        onlineCollection: {

      
            saveOnlineCollection: {
set: {
sourceId: string;
externalId: string;
title: string;
languageCode: string;
subtitle?: string;
artworkUrl?: string;
trackCount: number;
pageUrl?: string;
isFavorite?: boolean;
lastOpenedAt?: number;
updatedAt?: number;
deleted?: boolean;
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
};

          
            getMyOnlineCollections: {
set: {
page?: number;
limit?: number;
skip?: number;
isFavorite?: boolean;
sourceId?: string;
languageCode?: string;
sortBy?: ("updatedAt" | "lastOpenedAt" | "title" );
sortOrder?: ("asc" | "desc" );
};
get: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
tracks?: {
_id?: (0 | 1 );
title?: (0 | 1 );
contentHash?: (0 | 1 );
fileName?: (0 | 1 );
durationSec?: (0 | 1 );
fileSizeBytes?: (0 | 1 );
mimeType?: (0 | 1 );
isAudiobook?: (0 | 1 );
author?: (0 | 1 );
narrator?: (0 | 1 );
artworkUrl?: (0 | 1 );
totalPlayCount?: (0 | 1 );
totalListenTimeSec?: (0 | 1 );
lastPlayedAt?: (0 | 1 );
origin?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
collectionKey?: (0 | 1 );
collectionTitle?: (0 | 1 );
downloadedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
sessions?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contentHash?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
startPositionSec?: (0 | 1 );
endPositionSec?: (0 | 1 );
durationListenedSec?: (0 | 1 );
playbackSpeed?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
deviceInfo?: (0 | 1 );
contextPlayId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
stretchId?: (0 | 1 );
seeked?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
annotations?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
positionSec?: (0 | 1 );
text?: (0 | 1 );
tags?: (0 | 1 );
color?: (0 | 1 );
timesPlayedBefore?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playlists?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
isPublic?: (0 | 1 );
items?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
playbackContexts?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
contextType?: (0 | 1 );
contextKey?: (0 | 1 );
contextTitle?: (0 | 1 );
trackCount?: (0 | 1 );
startedAt?: (0 | 1 );
endedAt?: (0 | 1 );
lastIndex?: (0 | 1 );
lastTrackId?: (0 | 1 );
lastPositionSec?: (0 | 1 );
listenedSec?: (0 | 1 );
finishedCount?: (0 | 1 );
completed?: (0 | 1 );
interrupted?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
onlineCollections?: {
_id?: (0 | 1 );
clientId?: (0 | 1 );
sourceId?: (0 | 1 );
externalId?: (0 | 1 );
title?: (0 | 1 );
subtitle?: (0 | 1 );
artworkUrl?: (0 | 1 );
languageCode?: (0 | 1 );
trackCount?: (0 | 1 );
pageUrl?: (0 | 1 );
isFavorite?: (0 | 1 );
lastOpenedAt?: (0 | 1 );
deletedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
subscriptions?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
aiUsage?: {
_id?: (0 | 1 );
periodKey?: (0 | 1 );
creditsUsed?: (0 | 1 );
bonusCredits?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};
};
};

          
            removeOnlineCollection: {
set: {
sourceId: string;
externalId: string;
};
get?: {
success?: (0 | 1 );
};
};

          
          }

        
        subscription: {

      
            getMySubscription: {
set: {
};
get?: {
planCode?: (0 | 1 );
planTitle?: (0 | 1 );
isPaid?: (0 | 1 );
status?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
autoRenew?: (0 | 1 );
startedAt?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: {
historyEntries?: (0 | 1 );
playlists?: (0 | 1 );
maxTracks?: (0 | 1 );
};
priceCents?: (0 | 1 );
currency?: (0 | 1 );
billingInterval?: (0 | 1 );
description?: (0 | 1 );
features?: (0 | 1 );
limits?: {
historyEntries?: (0 | 1 );
crossDeviceSync?: (0 | 1 );
playlists?: (0 | 1 );
maxTracks?: (0 | 1 );
aiCreditsPerMonth?: (0 | 1 );
};
history?: {
limit?: (0 | 1 );
used?: (0 | 1 );
remaining?: (0 | 1 );
unlimited?: (0 | 1 );
};
};
};

          
            createCheckout: {
set: {
planCode: string;
provider?: ("manual" | "stripe" );
successUrl?: string;
cancelUrl?: string;
};
get?: {
reference?: (0 | 1 );
provider?: (0 | 1 );
status?: (0 | 1 );
checkoutUrl?: (0 | 1 );
instructions?: (0 | 1 );
amountCents?: (0 | 1 );
currency?: (0 | 1 );
planCode?: (0 | 1 );
planTitle?: (0 | 1 );
};
};

          
            confirmCheckout: {
set: {
reference: string;
};
get?: {
reference?: (0 | 1 );
status?: (0 | 1 );
alreadyProcessed?: (0 | 1 );
planCode?: (0 | 1 );
awaitingConfirmation?: (0 | 1 );
periodStart?: (0 | 1 );
periodEnd?: (0 | 1 );
};
};

          
            cancelMySubscription: {
set: {
};
get?: {
canceled?: (0 | 1 );
status?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
planCode?: (0 | 1 );
};
};

          
            adminGrantSubscription: {
set: {
userId: string;
planCode: string;
mode?: ("forever" | "duration" | "usage" );
duration?: {
value: number;
unit: ("day" | "week" | "month" | "year" );
};
caps?: {
historyEntries?: number;
playlists?: number;
maxTracks?: number;
};
interval?: ("month" | "year" | "lifetime" );
note?: string;
};
get?: {
reference?: (0 | 1 );
planCode?: (0 | 1 );
planTitle?: (0 | 1 );
status?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: {
historyEntries?: (0 | 1 );
playlists?: (0 | 1 );
maxTracks?: (0 | 1 );
};
currentPeriodEnd?: (0 | 1 );
periodStart?: (0 | 1 );
periodEnd?: (0 | 1 );
};
};

          
            adminRevokeSubscription: {
set: {
userId: string;
reason?: string;
};
get?: {
revoked?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
limits?: {
historyEntries?: (0 | 1 );
crossDeviceSync?: (0 | 1 );
playlists?: (0 | 1 );
maxTracks?: (0 | 1 );
aiCreditsPerMonth?: (0 | 1 );
};
};
};

          
            adminListSubscriptions: {
set: {
page?: number;
limit?: number;
status?: ("active" | "trialing" | "past_due" | "canceled" | "expired" );
planCode?: string;
search?: string;
};
get?: {
_id?: (0 | 1 );
planCode?: (0 | 1 );
status?: (0 | 1 );
startedAt?: (0 | 1 );
currentPeriodStart?: (0 | 1 );
currentPeriodEnd?: (0 | 1 );
cancelAtPeriodEnd?: (0 | 1 );
canceledAt?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
autoRenew?: (0 | 1 );
note?: (0 | 1 );
grantMode?: (0 | 1 );
usageCaps?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
user?: {
_id?: (0 | 1 );
username?: (0 | 1 );
email?: (0 | 1 );
displayName?: (0 | 1 );
avatarUrl?: (0 | 1 );
setting?: (0 | 1 );
role?: (0 | 1 );
status?: (0 | 1 );
suspendedAt?: (0 | 1 );
suspendedReason?: (0 | 1 );
};
};
};

          
          }

        
        aiUsage: {

      
            getMyAiUsage: {
set: {
periodKey?: string;
};
get?: {
periodKey?: (0 | 1 );
enabled?: (0 | 1 );
planCode?: (0 | 1 );
allowance?: (0 | 1 );
bonusCredits?: (0 | 1 );
used?: (0 | 1 );
remaining?: (0 | 1 );
requestCount?: (0 | 1 );
lastUsedAt?: (0 | 1 );
};
};

          
            adminGrantAiCredits: {
set: {
userId: string;
credits: number;
periodKey?: string;
note?: string;
};
get?: {
userId?: (0 | 1 );
periodKey?: (0 | 1 );
granted?: (0 | 1 );
bonusCredits?: (0 | 1 );
creditsUsed?: (0 | 1 );
};
};

          
          }

        
        platformSetting: {

      
            getPlatformStatus: {
set: {
};
get?: {
signupsEnabled?: (0 | 1 );
aiEnabled?: (0 | 1 );
maintenanceMode?: (0 | 1 );
announcement?: (0 | 1 );
};
};

          
            adminGetPlatformSetting: {
set: {
};
get?: {
key?: (0 | 1 );
signupsEnabled?: (0 | 1 );
aiEnabled?: (0 | 1 );
maintenanceMode?: (0 | 1 );
announcement?: (0 | 1 );
};
};

          
            adminUpdatePlatformSetting: {
set: {
signupsEnabled?: boolean;
aiEnabled?: boolean;
maintenanceMode?: boolean;
announcement?: string;
};
get?: {
key?: (0 | 1 );
signupsEnabled?: (0 | 1 );
aiEnabled?: (0 | 1 );
maintenanceMode?: (0 | 1 );
announcement?: (0 | 1 );
};
};

          
          }

        
        plan: {

      
            adminListPlans: {
set: {
includeInactive?: boolean;
};
get?: {
_id?: (0 | 1 );
code?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
priceCents?: (0 | 1 );
currency?: (0 | 1 );
billingInterval?: (0 | 1 );
isActive?: (0 | 1 );
isDefault?: (0 | 1 );
sortOrder?: (0 | 1 );
limits?: (0 | 1 );
features?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
subscribers?: (0 | 1 );
};
};

          
            adminUpsertPlan: {
set: {
code: string;
title?: string;
description?: string;
priceCents?: number;
currency?: string;
billingInterval?: ("month" | "year" | "lifetime" );
isActive?: boolean;
isDefault?: boolean;
sortOrder?: number;
limits?: {
historyEntries?: number;
crossDeviceSync?: boolean;
playlists?: number;
maxTracks?: number;
aiCreditsPerMonth?: number;
};
features?: string[];
};
get?: {
_id?: (0 | 1 );
code?: (0 | 1 );
title?: (0 | 1 );
description?: (0 | 1 );
priceCents?: (0 | 1 );
currency?: (0 | 1 );
billingInterval?: (0 | 1 );
isActive?: (0 | 1 );
isDefault?: (0 | 1 );
sortOrder?: (0 | 1 );
limits?: (0 | 1 );
features?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};

          
          }

        
        billingTransaction: {

      
            adminListTransactions: {
set: {
page?: number;
limit?: number;
status?: ("pending" | "paid" | "failed" | "refunded" | "canceled" );
provider?: string;
planCode?: string;
userId?: string;
search?: string;
from?: number;
to?: number;
};
get?: {
_id?: (0 | 1 );
reference?: (0 | 1 );
userId?: (0 | 1 );
userEmail?: (0 | 1 );
planCode?: (0 | 1 );
planTitle?: (0 | 1 );
amountCents?: (0 | 1 );
currency?: (0 | 1 );
billingInterval?: (0 | 1 );
status?: (0 | 1 );
provider?: (0 | 1 );
providerRef?: (0 | 1 );
periodStart?: (0 | 1 );
periodEnd?: (0 | 1 );
note?: (0 | 1 );
paidAt?: (0 | 1 );
refundedAt?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};

          
            adminConfirmTransaction: {
set: {
reference: string;
note?: string;
};
get?: {
reference?: (0 | 1 );
status?: (0 | 1 );
alreadyProcessed?: (0 | 1 );
planCode?: (0 | 1 );
periodStart?: (0 | 1 );
periodEnd?: (0 | 1 );
};
};

          
            adminRefundTransaction: {
set: {
reference: string;
reason?: string;
};
get?: {
refunded?: (0 | 1 );
reference?: (0 | 1 );
status?: (0 | 1 );
accessRevoked?: (0 | 1 );
};
};

          
          }

        
        adminAuditLog: {

      
            adminListAuditLogs: {
set: {
page?: number;
limit?: number;
actorId?: string;
action?: string;
targetType?: string;
targetId?: string;
from?: number;
to?: number;
};
get?: {
_id?: (0 | 1 );
actorId?: (0 | 1 );
actorEmail?: (0 | 1 );
actorRole?: (0 | 1 );
action?: (0 | 1 );
targetType?: (0 | 1 );
targetId?: (0 | 1 );
summary?: (0 | 1 );
metadata?: (0 | 1 );
createdAt?: (0 | 1 );
updatedAt?: (0 | 1 );
};
};

          
          }

        
        }

      
    };

  
export type DeepPartial<T> = {
	[P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const lesanApi = (
	{ URL, settings, baseHeaders }: {
		URL: string;
		settings?: Record<string, any>;
		baseHeaders?: Record<string, any>;
	},
) => {
	const setting = {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...baseHeaders,
		},
		...settings,
	};

	const setHeaders = (headers: Record<string, any>) => {
		setting.headers = {
			...setting.headers,
			...headers,
		};
	};

	const getSetting = () => setting;

	const send = async <
		TService extends keyof ReqType,
		TModel extends keyof ReqType[TService],
		TAct extends keyof ReqType[TService][TModel],
    // @ts-ignore: Unreachable code error
		TSet extends DeepPartial<ReqType[TService][TModel][TAct]["set"]>,
    // @ts-ignore: Unreachable code error
		TGet extends DeepPartial<ReqType[TService][TModel][TAct]["get"]>,
	>(body: {
		service?: TService;
		model: TModel;
		act: TAct;
		details: {
			set: TSet;
			get: TGet;
		};
	}, additionalHeaders?: Record<string, any>) => {
		const req = await fetch(URL, {
			...getSetting(),
			headers: {
				...getSetting().headers,
				...additionalHeaders,
		    connection: "keep-alive",
			},
			body: JSON.stringify(body),
		});

		return await req.json();
	};

	return { send, setHeaders };
};

  
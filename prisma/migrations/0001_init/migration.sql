-- Migration: 0001_init
-- WatchStudio initial schema.
--
-- Tables:
--   User, Account, Session, VerificationToken   (Auth.js v5 / Prisma adapter)
--   MediaItem, WatchRoom, RoomMember, Invitation, ChatMessage, PlaybackSession, Report

-- CreateEnum
CREATE TYPE "MediaCategory" AS ENUM ('FOOTBALL', 'MOVIE');
CREATE TYPE "MediaAccessMode" AS ENUM ('EMBED', 'EXTERNAL');
CREATE TYPE "MediaPlaybackMode" AS ENUM ('SYNCHRONIZED', 'EXTERNAL', 'UNSUPPORTED');
CREATE TYPE "MediaAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'BREAKING', 'REMOVED');
CREATE TYPE "RoomVisibility" AS ENUM ('PRIVATE');
CREATE TYPE "RoomStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE "RoomRole" AS ENUM ('HOST', 'MODERATOR', 'MEMBER');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');
CREATE TYPE "PlaybackState" AS ENUM ('PLAYING', 'PAUSED');
CREATE TYPE "PlaybackSessionStatus" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "ChatModerationStatus" AS ENUM ('OK', 'REMOVED');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- CreateTable: User (auth adapter + profile)
CREATE TABLE "User" (
    "id" text NOT NULL,
    "name" text,
    "email" text,
    "emailVerified" timestamp(3) with time zone,
    "image" text,
    "passwordHash" text,
    "role" text NOT NULL DEFAULT 'user',
    "status" text NOT NULL DEFAULT 'active',
    "createdAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    "updatedAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Account
CREATE TABLE "Account" (
    "id" text NOT NULL,
    "userId" text NOT NULL,
    "type" text NOT NULL,
    "provider" text NOT NULL,
    "providerAccountId" text NOT NULL,
    "refresh_token" text,
    "access_token" text,
    "expires_at" integer,
    "token_type" text,
    "scope" text,
    "id_token" text,
    "session_state" text,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Session
CREATE TABLE "Session" (
    "id" text NOT NULL,
    "sessionToken" text NOT NULL,
    "userId" text NOT NULL,
    "expires" timestamp(3) with time zone NOT NULL,
    "accessToken" text,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable: VerificationToken
CREATE TABLE "VerificationToken" (
    "identifier" text NOT NULL,
    "token" text NOT NULL,
    "expires" timestamp(3) with time zone NOT NULL,
    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier", "token")
);

-- CreateTable: MediaItem
CREATE TABLE "MediaItem" (
    "id" text NOT NULL,
    "ownerId" text NOT NULL,
    "title" text NOT NULL,
    "description" text,
    "category" "MediaCategory" NOT NULL,
    "originalUrl" text NOT NULL,
    "providerId" text NOT NULL,
    "providerVideoId" text,
    "thumbnailUrl" text,
    "accessMode" "MediaAccessMode" NOT NULL DEFAULT 'EXTERNAL',
    "playbackMode" "MediaPlaybackMode" NOT NULL DEFAULT 'UNSUPPORTED',
    "availability" "MediaAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "homeTeam" text,
    "awayTeam" text,
    "competition" text,
    "kickoffAt" timestamp(3) with time zone,
    "matchStatus" text,
    "releaseYear" integer,
    "genre" text,
    "durationMins" integer,
    "visibility" text NOT NULL DEFAULT 'private',
    "moderationStatus" text NOT NULL DEFAULT 'approved',
    "createdAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    "updatedAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "MediaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: WatchRoom
CREATE TABLE "WatchRoom" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "hostId" text NOT NULL,
    "currentMediaId" text,
    "visibility" "RoomVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "RoomStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxMembers" integer NOT NULL DEFAULT 50,
    "createdAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    "updatedAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "WatchRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RoomMember
CREATE TABLE "RoomMember" (
    "id" text NOT NULL,
    "roomId" text NOT NULL,
    "userId" text NOT NULL,
    "role" "RoomRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    "lastSeenAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "RoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Invitation
CREATE TABLE "Invitation" (
    "id" text NOT NULL,
    "roomId" text NOT NULL,
    "inviterId" text NOT NULL,
    "inviteeId" text,
    "tokenHash" text NOT NULL,
    "tokenExpiresAt" timestamp(3) with time zone NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedAt" timestamp(3) with time zone,
    "revokedAt" timestamp(3) with time zone,
    "revokedById" text,
    "createdAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChatMessage
CREATE TABLE "ChatMessage" (
    "id" text NOT NULL,
    "roomId" text NOT NULL,
    "userId" text NOT NULL,
    "body" text NOT NULL,
    "moderation" "ChatModerationStatus" NOT NULL DEFAULT 'OK',
    "editedAt" timestamp(3) with time zone,
    "createdAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PlaybackSession
CREATE TABLE "PlaybackSession" (
    "id" text NOT NULL,
    "roomId" text NOT NULL,
    "mediaId" text NOT NULL,
    "providerId" text NOT NULL,
    "state" "PlaybackState" NOT NULL DEFAULT 'PAUSED',
    "positionMs" integer NOT NULL DEFAULT 0,
    "version" integer NOT NULL DEFAULT 1,
    "updatedAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    "updatedById" text,
    "status" "PlaybackSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Report
CREATE TABLE "Report" (
    "id" text NOT NULL,
    "mediaId" text,
    "roomId" text,
    "reporterId" text NOT NULL,
    "reason" text NOT NULL,
    "description" text,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" text,
    "reviewedAt" timestamp(3) with time zone,
    "createdAt" timestamp(3) with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE INDEX "MediaItem_ownerId_idx" ON "MediaItem"("ownerId");
CREATE INDEX "MediaItem_category_idx" ON "MediaItem"("category");
CREATE INDEX "MediaItem_providerId_idx" ON "MediaItem"("providerId");
CREATE INDEX "MediaItem_availability_idx" ON "MediaItem"("availability");
CREATE INDEX "WatchRoom_hostId_idx" ON "WatchRoom"("hostId");
CREATE INDEX "WatchRoom_visibility_idx" ON "WatchRoom"("visibility");
CREATE INDEX "WatchRoom_status_idx" ON "WatchRoom"("status");
CREATE UNIQUE INDEX "RoomMember_roomId_userId_key" ON "RoomMember"("roomId", "userId");
CREATE INDEX "RoomMember_userId_idx" ON "RoomMember"("userId");
CREATE INDEX "Invitation_roomId_idx" ON "Invitation"("roomId");
CREATE INDEX "Invitation_status_idx" ON "Invitation"("status");
CREATE INDEX "Invitation_tokenHash_idx" ON "Invitation"("tokenHash");
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId", "createdAt");
CREATE INDEX "ChatMessage_userId_idx" ON "ChatMessage"("userId");
CREATE INDEX "PlaybackSession_roomId_idx" ON "PlaybackSession"("roomId");
CREATE INDEX "PlaybackSession_mediaId_idx" ON "PlaybackSession"("mediaId");
CREATE INDEX "Report_status_idx" ON "Report"("status");
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaItem" ADD CONSTRAINT "MediaItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchRoom" ADD CONSTRAINT "WatchRoom_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WatchRoom" ADD CONSTRAINT "WatchRoom_currentMediaId_fkey" FOREIGN KEY ("currentMediaId") REFERENCES "MediaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "WatchRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomMember" ADD CONSTRAINT "RoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "WatchRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "WatchRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "WatchRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "WatchRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

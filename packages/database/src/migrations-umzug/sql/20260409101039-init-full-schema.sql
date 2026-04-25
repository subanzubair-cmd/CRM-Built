--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: ActiveLeadStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ActiveLeadStage" AS ENUM (
    'NEW_LEAD',
    'DISCOVERY',
    'INTERESTED_ADD_TO_FOLLOW_UP',
    'APPOINTMENT_MADE',
    'DUE_DILIGENCE',
    'OFFER_MADE',
    'OFFER_FOLLOW_UP',
    'UNDER_CONTRACT',
    'VETTED_AGENTS'
);

--
-- Name: AiEngine; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AiEngine" AS ENUM (
    'TEXT_CONVERSATIONAL',
    'LEAD_SUMMARIZATION',
    'HOT_LEAD_DETECTION',
    'VOICE_CONVERSATIONAL',
    'DRIP_PERSONALIZATION'
);

--
-- Name: AutomationActionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AutomationActionType" AS ENUM (
    'SEND_SMS',
    'SEND_EMAIL',
    'SEND_RVM',
    'ADD_TAG',
    'CHANGE_STAGE',
    'ASSIGN_USER',
    'CREATE_TASK',
    'ENROLL_CAMPAIGN'
);

--
-- Name: AutomationTrigger; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AutomationTrigger" AS ENUM (
    'STAGE_CHANGE',
    'LEAD_CREATED',
    'TAG_ADDED',
    'NO_CONTACT_X_DAYS',
    'OFFER_MADE',
    'UNDER_CONTRACT',
    'MANUAL'
);

--
-- Name: CampaignStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CampaignStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'ARCHIVED'
);

--
-- Name: CampaignType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CampaignType" AS ENUM (
    'DRIP',
    'BROADCAST'
);

--
-- Name: ContactType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContactType" AS ENUM (
    'SELLER',
    'BUYER',
    'AGENT',
    'VENDOR',
    'OTHER'
);

--
-- Name: DispoStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DispoStage" AS ENUM (
    'POTENTIAL_BUYER',
    'COLD_BUYER',
    'WARM_BUYER',
    'HOT_BUYER',
    'DISPO_OFFER_RECEIVED',
    'SOLD'
);

--
-- Name: ExitStrategy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExitStrategy" AS ENUM (
    'WHOLESALE_ASSIGNMENT',
    'WHOLESALE_DOUBLE_CLOSE',
    'INSTALLMENT',
    'SELLER_FINANCE',
    'FIX_AND_FLIP',
    'JOINT_VENTURE',
    'NEW_CONSTRUCTION',
    'NOVATION',
    'PARTNERSHIP',
    'PROJECT_MANAGEMENT',
    'RETAIL_LISTING',
    'SALE_LEASEBACK',
    'WHOLETAIL',
    'RENTAL',
    'TURNKEY'
);

--
-- Name: FileType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FileType" AS ENUM (
    'DOCUMENT',
    'IMAGE',
    'CONTRACT',
    'INSPECTION',
    'PHOTO',
    'OTHER'
);

--
-- Name: InventoryStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InventoryStage" AS ENUM (
    'NEW_INVENTORY',
    'GETTING_ESTIMATES',
    'UNDER_REHAB',
    'LISTED_FOR_SALE',
    'UNDER_CONTRACT'
);

--
-- Name: LeadAssignmentMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeadAssignmentMethod" AS ENUM (
    'ROUND_ROBIN',
    'FIRST_TO_CLAIM',
    'MANUAL'
);

--
-- Name: LeadCampaignType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeadCampaignType" AS ENUM (
    'DTS',
    'DTA',
    'BUYER',
    'VENDOR'
);

--
-- Name: LeadStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeadStatus" AS ENUM (
    'ACTIVE',
    'WARM',
    'DEAD',
    'REFERRED_TO_AGENT'
);

--
-- Name: LeadType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeadType" AS ENUM (
    'DIRECT_TO_SELLER',
    'DIRECT_TO_AGENT'
);

--
-- Name: MessageChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MessageChannel" AS ENUM (
    'SMS',
    'CALL',
    'RVM',
    'EMAIL',
    'NOTE',
    'SYSTEM'
);

--
-- Name: MessageDirection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MessageDirection" AS ENUM (
    'INBOUND',
    'OUTBOUND'
);

--
-- Name: NotificationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."NotificationType" AS ENUM (
    'NEW_LEAD',
    'MESSAGE_RECEIVED',
    'TASK_DUE',
    'STAGE_CHANGE',
    'MENTION',
    'SYSTEM'
);

--
-- Name: PropertyStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PropertyStatus" AS ENUM (
    'LEAD',
    'UNDER_CONTRACT',
    'IN_TM',
    'IN_INVENTORY',
    'IN_DISPO',
    'SOLD',
    'RENTAL',
    'DEAD',
    'WARM',
    'REFERRED'
);

--
-- Name: TaskStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskStatus" AS ENUM (
    'PENDING',
    'COMPLETED',
    'CANCELLED'
);

--
-- Name: TaskType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TaskType" AS ENUM (
    'FOLLOW_UP',
    'APPOINTMENT',
    'OFFER',
    'CALL',
    'EMAIL',
    'OTHER'
);

--
-- Name: TemplateType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TemplateType" AS ENUM (
    'sms',
    'email',
    'rvm',
    'task',
    'direct_mail'
);

--
-- Name: TmStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TmStage" AS ENUM (
    'NEW_CONTRACT',
    'MARKETING_TO_BUYERS',
    'SHOWING_TO_BUYERS',
    'EVALUATING_OFFERS',
    'ACCEPTED_OFFER',
    'CLEAR_TO_CLOSE'
);

--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'INVITED'
);

--
-- Name: WebhookEventStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WebhookEventStatus" AS ENUM (
    'PENDING',
    'PROCESSED',
    'FAILED'
);

--
-- Name: WorkspaceType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WorkspaceType" AS ENUM (
    'leads',
    'tm',
    'inventory',
    'sold',
    'rental'
);

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AccountTag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AccountTag" (
    id text NOT NULL,
    name text NOT NULL,
    "accountType" text DEFAULT 'expense'::text NOT NULL,
    category text,
    "subCategory" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: ActiveCall; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ActiveCall" (
    id text NOT NULL,
    "conferenceId" text,
    "conferenceName" text NOT NULL,
    "agentCallSid" text,
    "customerCallSid" text,
    "supervisorCallSid" text,
    "propertyId" text,
    "agentUserId" text,
    "customerPhone" text,
    status text DEFAULT 'INITIATING'::text NOT NULL,
    "supervisorMode" text,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    direction text DEFAULT 'OUTBOUND'::text NOT NULL,
    "rejectedReason" text,
    "leadCampaignId" text
);

--
-- Name: ActivityLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ActivityLog" (
    id text NOT NULL,
    "propertyId" text,
    "userId" text,
    "userName" text,
    action text NOT NULL,
    detail jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "actorType" text DEFAULT 'user'::text NOT NULL
);

--
-- Name: AiConfiguration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AiConfiguration" (
    id text NOT NULL,
    "capabilityType" text NOT NULL,
    "isEnabled" boolean DEFAULT false NOT NULL,
    "configJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "voiceSettings" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "escalationRules" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: AiLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AiLog" (
    id text NOT NULL,
    "propertyId" text,
    engine public."AiEngine" NOT NULL,
    input jsonb NOT NULL,
    output jsonb NOT NULL,
    tokens integer,
    "latencyMs" integer,
    reviewed boolean DEFAULT false NOT NULL,
    "reviewedAt" timestamp(3) without time zone,
    "reviewedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: ApiToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ApiToken" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    prefix text NOT NULL,
    "lastUsedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Appointment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Appointment" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    title text NOT NULL,
    description text,
    "startAt" timestamp(3) without time zone NOT NULL,
    "endAt" timestamp(3) without time zone NOT NULL,
    location text,
    attendees text[],
    "googleEventId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Automation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Automation" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    trigger public."AutomationTrigger" NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: AutomationAction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AutomationAction" (
    id text NOT NULL,
    "automationId" text NOT NULL,
    "order" integer NOT NULL,
    "actionType" public."AutomationActionType" NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Buyer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Buyer" (
    id text NOT NULL,
    "contactId" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "preferredMarkets" text[],
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: BuyerCriteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BuyerCriteria" (
    id text NOT NULL,
    "buyerId" text NOT NULL,
    markets text[],
    "propertyTypes" text[],
    "minBeds" integer,
    "maxBeds" integer,
    "minBaths" numeric(4,1),
    "maxBaths" numeric(4,1),
    "minPrice" numeric(12,2),
    "maxPrice" numeric(12,2),
    "minSqft" integer,
    "maxSqft" integer,
    "minArv" numeric(12,2),
    "maxArv" numeric(12,2),
    "maxRepairs" numeric(12,2),
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: BuyerMatch; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BuyerMatch" (
    id text NOT NULL,
    "buyerId" text NOT NULL,
    "propertyId" text NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    notified boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dispoStage" public."DispoStage" DEFAULT 'POTENTIAL_BUYER'::public."DispoStage" NOT NULL,
    "dispoOfferAmount" numeric(12,2)
);

--
-- Name: BuyerOffer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BuyerOffer" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    "buyerId" text NOT NULL,
    "dispoOfferAmount" numeric(12,2) NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    notes text,
    "submittedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "respondedAt" timestamp(3) without time zone,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "contractPayload" jsonb,
    "earnestMoney" numeric(12,2),
    "inspectionEndDate" timestamp(3) without time zone,
    "recordType" text DEFAULT 'offer'::text NOT NULL,
    "closingDate" timestamp(3) without time zone,
    "exitTypeSnapshot" text,
    "expectedProfit" numeric(12,2)
);

--
-- Name: Campaign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Campaign" (
    id text NOT NULL,
    name text NOT NULL,
    type public."CampaignType" NOT NULL,
    status public."CampaignStatus" DEFAULT 'DRAFT'::public."CampaignStatus" NOT NULL,
    description text,
    "marketId" text,
    tags text[],
    "leadTypes" public."LeadType"[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "aiEnabled" boolean DEFAULT false NOT NULL
);

--
-- Name: CampaignEnrollment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignEnrollment" (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    "propertyId" text NOT NULL,
    "currentStep" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "pausedAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "enrolledAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: CampaignStep; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignStep" (
    id text NOT NULL,
    "campaignId" text NOT NULL,
    "order" integer NOT NULL,
    "delayDays" integer DEFAULT 0 NOT NULL,
    "delayHours" integer DEFAULT 0 NOT NULL,
    channel public."MessageChannel" NOT NULL,
    subject text,
    body text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: CommProviderConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommProviderConfig" (
    id text NOT NULL,
    "providerName" text NOT NULL,
    "isActive" boolean DEFAULT false NOT NULL,
    "defaultNumber" text,
    "configJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Contact" (
    id text NOT NULL,
    type public."ContactType" NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text,
    email text,
    phone text,
    phone2 text,
    address text,
    city text,
    state text,
    zip text,
    notes text,
    tags text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "doNotCall" boolean DEFAULT false NOT NULL,
    "doNotText" boolean DEFAULT false NOT NULL,
    "preferredChannel" text,
    "doNotEmail" boolean DEFAULT false NOT NULL
);

--
-- Name: Conversation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Conversation" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    "contactPhone" text,
    "contactEmail" text,
    "isRead" boolean DEFAULT false NOT NULL,
    "lastMessageAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "contactId" text
);

--
-- Name: CustomFormConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomFormConfig" (
    id text NOT NULL,
    "entityType" text NOT NULL,
    sections jsonb DEFAULT '[]'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: DirectMailCampaign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DirectMailCampaign" (
    id text NOT NULL,
    name text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    "sendDate" timestamp(3) without time zone,
    recipients integer DEFAULT 0 NOT NULL,
    delivered integer DEFAULT 0 NOT NULL,
    returned integer DEFAULT 0 NOT NULL,
    "templateId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: EsignDocument; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EsignDocument" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    name text NOT NULL,
    "providerRef" text,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "signedAt" timestamp(3) without time zone,
    "storageKey" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "templateId" text
);

--
-- Name: EsignTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EsignTemplate" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    "documentUrl" text,
    status text DEFAULT 'active'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: FinancialAccount; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FinancialAccount" (
    id text NOT NULL,
    "bankName" text NOT NULL,
    "accountType" text,
    balance numeric(14,2) DEFAULT 0 NOT NULL,
    "startBalance" numeric(14,2) DEFAULT 0 NOT NULL,
    "lastUpdated" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: FinancialGoal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FinancialGoal" (
    id text NOT NULL,
    year integer NOT NULL,
    type text NOT NULL,
    target numeric(14,2) NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: FinancialTransaction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FinancialTransaction" (
    id text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    description text NOT NULL,
    amount numeric(14,2) NOT NULL,
    type text DEFAULT 'expense'::text NOT NULL,
    "accountId" text NOT NULL,
    "vendorName" text,
    "propertyId" text,
    "categoryId" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: GlobalFile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GlobalFile" (
    id text NOT NULL,
    name text NOT NULL,
    url text,
    size integer,
    "mimeType" text,
    "folderId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "modifiedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: GlobalFolder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GlobalFolder" (
    id text NOT NULL,
    name text NOT NULL,
    "parentId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: LeadCampaign; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadCampaign" (
    id text NOT NULL,
    name text NOT NULL,
    type public."LeadCampaignType" NOT NULL,
    "phoneNumberId" text,
    "leadSourceId" text,
    "callFlowName" text,
    "assignmentMethod" public."LeadAssignmentMethod" DEFAULT 'ROUND_ROBIN'::public."LeadAssignmentMethod" NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: LeadCampaignRoleToggle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadCampaignRoleToggle" (
    id text NOT NULL,
    "leadCampaignId" text NOT NULL,
    "roleId" text NOT NULL,
    enabled boolean DEFAULT false NOT NULL
);

--
-- Name: LeadCampaignUser; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadCampaignUser" (
    id text NOT NULL,
    "leadCampaignId" text NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: LeadOffer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadOffer" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    "offerBy" text NOT NULL,
    "offerDate" timestamp(3) without time zone NOT NULL,
    "offerType" text NOT NULL,
    "offerPrice" numeric(12,2) NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: LeadSource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LeadSource" (
    id text NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "isSystem" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: ListStackSource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ListStackSource" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    tags text[],
    "totalImported" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Market; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Market" (
    id text NOT NULL,
    name text NOT NULL,
    state text DEFAULT 'TX'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Message" (
    id text NOT NULL,
    "propertyId" text,
    "conversationId" text,
    channel public."MessageChannel" NOT NULL,
    direction public."MessageDirection" NOT NULL,
    body text,
    subject text,
    "from" text,
    "to" text,
    "sentById" text,
    "twilioSid" text,
    "emailMessageId" text,
    "isAiGenerated" boolean DEFAULT false NOT NULL,
    "aiReviewed" boolean DEFAULT false NOT NULL,
    "readAt" timestamp(3) without time zone,
    "deliveredAt" timestamp(3) without time zone,
    "failedAt" timestamp(3) without time zone,
    "failReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "callOutcome" text,
    "contactId" text,
    "durationSeconds" integer,
    "aiGradeJson" jsonb,
    "aiSummaryText" text,
    "recordingUrl" text,
    status text,
    "attachmentUrls" text[],
    "scheduledAt" timestamp(3) without time zone,
    timezone text,
    "leadCampaignId" text
);

--
-- Name: Note; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Note" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    body text NOT NULL,
    "authorId" text,
    "authorName" text,
    "isPinned" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type public."NotificationType" NOT NULL,
    title text NOT NULL,
    body text,
    "propertyId" text,
    "isRead" boolean DEFAULT false NOT NULL,
    "readAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: Property; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Property" (
    id text NOT NULL,
    "streetAddress" text,
    city text,
    state text,
    zip text,
    county text,
    "normalizedAddress" text,
    bedrooms integer,
    bathrooms numeric(4,1),
    sqft integer,
    "yearBuilt" integer,
    "lotSize" numeric(10,2),
    "propertyType" text,
    "leadType" public."LeadType" NOT NULL,
    "leadStatus" public."LeadStatus" DEFAULT 'ACTIVE'::public."LeadStatus" NOT NULL,
    "propertyStatus" public."PropertyStatus" DEFAULT 'LEAD'::public."PropertyStatus" NOT NULL,
    "activeLeadStage" public."ActiveLeadStage",
    "exitStrategy" public."ExitStrategy",
    "isHot" boolean DEFAULT false NOT NULL,
    "isFavorited" boolean DEFAULT false NOT NULL,
    "isOpen" boolean DEFAULT true NOT NULL,
    "askingPrice" numeric(12,2),
    "offerPrice" numeric(12,2),
    arv numeric(12,2),
    "repairEstimate" numeric(12,2),
    "tmStage" public."TmStage",
    "inventoryStage" public."InventoryStage",
    "inDispo" boolean DEFAULT false NOT NULL,
    "soldAt" timestamp(3) without time zone,
    "rentalAt" timestamp(3) without time zone,
    "marketId" text,
    "assignedToId" text,
    "createdById" text NOT NULL,
    source text,
    "campaignName" text,
    tags text[],
    "contractDate" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "aiSummary" text,
    "lastActivityAt" timestamp(3) without time zone,
    contingencies text,
    "contractPrice" numeric(12,2),
    "expectedProfit" numeric(12,2),
    "expectedProfitDate" timestamp(3) without time zone,
    "offerDate" timestamp(3) without time zone,
    "offerType" text,
    "scheduledClosingDate" timestamp(3) without time zone,
    "leadNumber" text,
    "occupancyStatus" text,
    "propertyCondition" text,
    apn text,
    "deadAt" timestamp(3) without time zone,
    "dispoAssigneeId" text,
    "estimatedValue" numeric(12,2),
    "garageArea" integer,
    "garageType" text,
    "leadScore" integer,
    "mortgageInfoJson" jsonb,
    "referredAt" timestamp(3) without time zone,
    "taxInfoJson" jsonb,
    "underContractAt" timestamp(3) without time zone,
    "underContractPrice" numeric(12,2),
    "valuationJson" jsonb,
    "versionNo" integer DEFAULT 1 NOT NULL,
    "warmAt" timestamp(3) without time zone,
    "soldPrice" numeric(12,2),
    "defaultOutboundNumber" text,
    "leadCampaignId" text
);

--
-- Name: PropertyContact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PropertyContact" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    "contactId" text NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    role text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: PropertyFile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PropertyFile" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    type public."FileType" DEFAULT 'OTHER'::public."FileType" NOT NULL,
    name text NOT NULL,
    "mimeType" text NOT NULL,
    size integer NOT NULL,
    "storageKey" text NOT NULL,
    "uploadedById" text,
    "uploadedByName" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: PropertyTeamAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PropertyTeamAssignment" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    "roleId" text NOT NULL,
    "userId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Role" (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    permissions text[],
    "isSystem" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: SavedFilter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SavedFilter" (
    id text NOT NULL,
    "userId" text NOT NULL,
    name text NOT NULL,
    pipeline text NOT NULL,
    filters jsonb NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: StageHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StageHistory" (
    id text NOT NULL,
    "propertyId" text NOT NULL,
    pipeline text NOT NULL,
    "fromStage" text,
    "toStage" text NOT NULL,
    "changedById" text,
    "changedByName" text,
    reason text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: StatusAutomation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StatusAutomation" (
    id text NOT NULL,
    "workspaceType" public."WorkspaceType" NOT NULL,
    "stageCode" text NOT NULL,
    "dripCampaignId" text,
    "taskTemplateId" text,
    "taskTitle" text,
    "taskAssigneeId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Tag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tag" (
    id text NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#3B82F6'::text NOT NULL,
    category text DEFAULT 'lead'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Task; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Task" (
    id text NOT NULL,
    "propertyId" text,
    title text NOT NULL,
    description text,
    type public."TaskType" DEFAULT 'OTHER'::public."TaskType" NOT NULL,
    status public."TaskStatus" DEFAULT 'PENDING'::public."TaskStatus" NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    "dueAt" timestamp(3) without time zone,
    "completedAt" timestamp(3) without time zone,
    "assignedToId" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "dueTime" text,
    "repeatConfigJson" jsonb,
    "repeatType" text,
    "sourceType" text DEFAULT 'manual'::text,
    "templateId" text
);

--
-- Name: Template; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Template" (
    id text NOT NULL,
    "templateType" public."TemplateType" NOT NULL,
    name text NOT NULL,
    category text,
    subject text,
    "bodyContent" text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: TwilioNumber; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TwilioNumber" (
    id text NOT NULL,
    number text NOT NULL,
    "friendlyName" text,
    "marketId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    purpose text DEFAULT 'general'::text NOT NULL,
    "spamStatus" text,
    "speedToLead" boolean DEFAULT false NOT NULL,
    "tenDlcStatus" text,
    "lastSyncedAt" timestamp(3) without time zone,
    "providerName" text,
    "providerSid" text
);

--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    name text NOT NULL,
    phone text,
    "avatarUrl" text,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    "roleId" text NOT NULL,
    "marketIds" text[],
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "notificationPrefs" jsonb,
    permissions text[],
    "vacationEnd" timestamp(3) without time zone,
    "vacationMode" boolean DEFAULT false NOT NULL,
    "vacationStart" timestamp(3) without time zone,
    "sessionVersion" integer DEFAULT 0 NOT NULL
);

--
-- Name: UserCampaignAssignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserCampaignAssignment" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "roleId" text NOT NULL,
    "campaignId" text NOT NULL,
    "assignNewLeads" boolean DEFAULT false NOT NULL,
    "backfillExistingLeads" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: UserRoleConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserRoleConfig" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "roleId" text NOT NULL,
    "leadAccessEnabled" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Vendor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Vendor" (
    id text NOT NULL,
    "contactId" text NOT NULL,
    category text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    markets text[],
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: WebFormConfig; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebFormConfig" (
    id text NOT NULL,
    "entityType" text NOT NULL,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    "embedCode" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: Webhook; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Webhook" (
    id text NOT NULL,
    "friendlyName" text NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    "endpointUrl" text NOT NULL,
    events text[],
    "secretHash" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

--
-- Name: WebhookEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebhookEvent" (
    id text NOT NULL,
    source text NOT NULL,
    "eventType" text NOT NULL,
    payload jsonb NOT NULL,
    status public."WebhookEventStatus" DEFAULT 'PENDING'::public."WebhookEventStatus" NOT NULL,
    "processedAt" timestamp(3) without time zone,
    error text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: AccountTag AccountTag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccountTag"
    ADD CONSTRAINT "AccountTag_pkey" PRIMARY KEY (id);

--
-- Name: ActiveCall ActiveCall_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActiveCall"
    ADD CONSTRAINT "ActiveCall_pkey" PRIMARY KEY (id);

--
-- Name: ActivityLog ActivityLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityLog"
    ADD CONSTRAINT "ActivityLog_pkey" PRIMARY KEY (id);

--
-- Name: AiConfiguration AiConfiguration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiConfiguration"
    ADD CONSTRAINT "AiConfiguration_pkey" PRIMARY KEY (id);

--
-- Name: AiLog AiLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiLog"
    ADD CONSTRAINT "AiLog_pkey" PRIMARY KEY (id);

--
-- Name: ApiToken ApiToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiToken"
    ADD CONSTRAINT "ApiToken_pkey" PRIMARY KEY (id);

--
-- Name: Appointment Appointment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Appointment"
    ADD CONSTRAINT "Appointment_pkey" PRIMARY KEY (id);

--
-- Name: AutomationAction AutomationAction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationAction"
    ADD CONSTRAINT "AutomationAction_pkey" PRIMARY KEY (id);

--
-- Name: Automation Automation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Automation"
    ADD CONSTRAINT "Automation_pkey" PRIMARY KEY (id);

--
-- Name: BuyerCriteria BuyerCriteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BuyerCriteria"
    ADD CONSTRAINT "BuyerCriteria_pkey" PRIMARY KEY (id);

--
-- Name: BuyerMatch BuyerMatch_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BuyerMatch"
    ADD CONSTRAINT "BuyerMatch_pkey" PRIMARY KEY (id);

--
-- Name: BuyerOffer BuyerOffer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BuyerOffer"
    ADD CONSTRAINT "BuyerOffer_pkey" PRIMARY KEY (id);

--
-- Name: Buyer Buyer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Buyer"
    ADD CONSTRAINT "Buyer_pkey" PRIMARY KEY (id);

--
-- Name: CampaignEnrollment CampaignEnrollment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignEnrollment"
    ADD CONSTRAINT "CampaignEnrollment_pkey" PRIMARY KEY (id);

--
-- Name: CampaignStep CampaignStep_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignStep"
    ADD CONSTRAINT "CampaignStep_pkey" PRIMARY KEY (id);

--
-- Name: Campaign Campaign_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaign"
    ADD CONSTRAINT "Campaign_pkey" PRIMARY KEY (id);

--
-- Name: CommProviderConfig CommProviderConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommProviderConfig"
    ADD CONSTRAINT "CommProviderConfig_pkey" PRIMARY KEY (id);

--
-- Name: Contact Contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contact"
    ADD CONSTRAINT "Contact_pkey" PRIMARY KEY (id);

--
-- Name: Conversation Conversation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_pkey" PRIMARY KEY (id);

--
-- Name: CustomFormConfig CustomFormConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomFormConfig"
    ADD CONSTRAINT "CustomFormConfig_pkey" PRIMARY KEY (id);

--
-- Name: DirectMailCampaign DirectMailCampaign_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DirectMailCampaign"
    ADD CONSTRAINT "DirectMailCampaign_pkey" PRIMARY KEY (id);

--
-- Name: EsignDocument EsignDocument_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EsignDocument"
    ADD CONSTRAINT "EsignDocument_pkey" PRIMARY KEY (id);

--
-- Name: EsignTemplate EsignTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EsignTemplate"
    ADD CONSTRAINT "EsignTemplate_pkey" PRIMARY KEY (id);

--
-- Name: FinancialAccount FinancialAccount_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FinancialAccount"
    ADD CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY (id);

--
-- Name: FinancialGoal FinancialGoal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FinancialGoal"
    ADD CONSTRAINT "FinancialGoal_pkey" PRIMARY KEY (id);

--
-- Name: FinancialTransaction FinancialTransaction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FinancialTransaction"
    ADD CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY (id);

--
-- Name: GlobalFile GlobalFile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GlobalFile"
    ADD CONSTRAINT "GlobalFile_pkey" PRIMARY KEY (id);

--
-- Name: GlobalFolder GlobalFolder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GlobalFolder"
    ADD CONSTRAINT "GlobalFolder_pkey" PRIMARY KEY (id);

--
-- Name: LeadCampaignRoleToggle LeadCampaignRoleToggle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadCampaignRoleToggle"
    ADD CONSTRAINT "LeadCampaignRoleToggle_pkey" PRIMARY KEY (id);

--
-- Name: LeadCampaignUser LeadCampaignUser_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadCampaignUser"
    ADD CONSTRAINT "LeadCampaignUser_pkey" PRIMARY KEY (id);

--
-- Name: LeadCampaign LeadCampaign_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadCampaign"
    ADD CONSTRAINT "LeadCampaign_pkey" PRIMARY KEY (id);

--
-- Name: LeadOffer LeadOffer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadOffer"
    ADD CONSTRAINT "LeadOffer_pkey" PRIMARY KEY (id);

--
-- Name: LeadSource LeadSource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadSource"
    ADD CONSTRAINT "LeadSource_pkey" PRIMARY KEY (id);

--
-- Name: ListStackSource ListStackSource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ListStackSource"
    ADD CONSTRAINT "ListStackSource_pkey" PRIMARY KEY (id);

--
-- Name: Market Market_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Market"
    ADD CONSTRAINT "Market_pkey" PRIMARY KEY (id);

--
-- Name: Message Message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);

--
-- Name: Note Note_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Note"
    ADD CONSTRAINT "Note_pkey" PRIMARY KEY (id);

--
-- Name: Notification Notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);

--
-- Name: PropertyContact PropertyContact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PropertyContact"
    ADD CONSTRAINT "PropertyContact_pkey" PRIMARY KEY (id);

--
-- Name: PropertyFile PropertyFile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PropertyFile"
    ADD CONSTRAINT "PropertyFile_pkey" PRIMARY KEY (id);

--
-- Name: PropertyTeamAssignment PropertyTeamAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PropertyTeamAssignment"
    ADD CONSTRAINT "PropertyTeamAssignment_pkey" PRIMARY KEY (id);

--
-- Name: Property Property_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Property"
    ADD CONSTRAINT "Property_pkey" PRIMARY KEY (id);

--
-- Name: Role Role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Role"
    ADD CONSTRAINT "Role_pkey" PRIMARY KEY (id);

--
-- Name: SavedFilter SavedFilter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavedFilter"
    ADD CONSTRAINT "SavedFilter_pkey" PRIMARY KEY (id);

--
-- Name: StageHistory StageHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StageHistory"
    ADD CONSTRAINT "StageHistory_pkey" PRIMARY KEY (id);

--
-- Name: StatusAutomation StatusAutomation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StatusAutomation"
    ADD CONSTRAINT "StatusAutomation_pkey" PRIMARY KEY (id);

--
-- Name: Tag Tag_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tag"
    ADD CONSTRAINT "Tag_pkey" PRIMARY KEY (id);

--
-- Name: Task Task_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_pkey" PRIMARY KEY (id);

--
-- Name: Template Template_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Template"
    ADD CONSTRAINT "Template_pkey" PRIMARY KEY (id);

--
-- Name: TwilioNumber TwilioNumber_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TwilioNumber"
    ADD CONSTRAINT "TwilioNumber_pkey" PRIMARY KEY (id);

--
-- Name: UserCampaignAssignment UserCampaignAssignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserCampaignAssignment"
    ADD CONSTRAINT "UserCampaignAssignment_pkey" PRIMARY KEY (id);

--
-- Name: UserRoleConfig UserRoleConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRoleConfig"
    ADD CONSTRAINT "UserRoleConfig_pkey" PRIMARY KEY (id);

--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

--
-- Name: Vendor Vendor_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Vendor"
    ADD CONSTRAINT "Vendor_pkey" PRIMARY KEY (id);

--
-- Name: WebFormConfig WebFormConfig_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebFormConfig"
    ADD CONSTRAINT "WebFormConfig_pkey" PRIMARY KEY (id);

--
-- Name: WebhookEvent WebhookEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebhookEvent"
    ADD CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY (id);

--
-- Name: Webhook Webhook_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhook"
    ADD CONSTRAINT "Webhook_pkey" PRIMARY KEY (id);

--
-- Name: AccountTag_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AccountTag_name_key" ON public."AccountTag" USING btree (name);

--
-- Name: ActiveCall_conferenceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ActiveCall_conferenceId_key" ON public."ActiveCall" USING btree ("conferenceId");

--
-- Name: ActiveCall_conferenceName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ActiveCall_conferenceName_key" ON public."ActiveCall" USING btree ("conferenceName");

--
-- Name: AiConfiguration_capabilityType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AiConfiguration_capabilityType_key" ON public."AiConfiguration" USING btree ("capabilityType");

--
-- Name: ApiToken_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ApiToken_userId_idx" ON public."ApiToken" USING btree ("userId");

--
-- Name: BuyerMatch_buyerId_propertyId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "BuyerMatch_buyerId_propertyId_key" ON public."BuyerMatch" USING btree ("buyerId", "propertyId");

--
-- Name: Buyer_contactId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Buyer_contactId_key" ON public."Buyer" USING btree ("contactId");

--
-- Name: CampaignEnrollment_campaignId_propertyId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CampaignEnrollment_campaignId_propertyId_key" ON public."CampaignEnrollment" USING btree ("campaignId", "propertyId");

--
-- Name: CommProviderConfig_providerName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CommProviderConfig_providerName_key" ON public."CommProviderConfig" USING btree ("providerName");

--
-- Name: Conversation_contactId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Conversation_contactId_idx" ON public."Conversation" USING btree ("contactId");

--
-- Name: Conversation_propertyId_contactId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Conversation_propertyId_contactId_key" ON public."Conversation" USING btree ("propertyId", "contactId");

--
-- Name: CustomFormConfig_entityType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "CustomFormConfig_entityType_key" ON public."CustomFormConfig" USING btree ("entityType");

--
-- Name: FinancialGoal_userId_year_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FinancialGoal_userId_year_type_key" ON public."FinancialGoal" USING btree ("userId", year, type);

--
-- Name: LeadCampaignRoleToggle_leadCampaignId_roleId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LeadCampaignRoleToggle_leadCampaignId_roleId_key" ON public."LeadCampaignRoleToggle" USING btree ("leadCampaignId", "roleId");

--
-- Name: LeadCampaignUser_leadCampaignId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LeadCampaignUser_leadCampaignId_userId_key" ON public."LeadCampaignUser" USING btree ("leadCampaignId", "userId");

--
-- Name: LeadCampaignUser_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LeadCampaignUser_userId_idx" ON public."LeadCampaignUser" USING btree ("userId");

--
-- Name: LeadCampaign_leadSourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LeadCampaign_leadSourceId_idx" ON public."LeadCampaign" USING btree ("leadSourceId");

--
-- Name: LeadCampaign_phoneNumberId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LeadCampaign_phoneNumberId_key" ON public."LeadCampaign" USING btree ("phoneNumberId");

--
-- Name: LeadCampaign_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LeadCampaign_type_idx" ON public."LeadCampaign" USING btree (type);

--
-- Name: LeadOffer_propertyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "LeadOffer_propertyId_idx" ON public."LeadOffer" USING btree ("propertyId");

--
-- Name: LeadSource_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "LeadSource_name_key" ON public."LeadSource" USING btree (name);

--
-- Name: Market_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Market_name_key" ON public."Market" USING btree (name);

--
-- Name: PropertyContact_propertyId_contactId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PropertyContact_propertyId_contactId_key" ON public."PropertyContact" USING btree ("propertyId", "contactId");

--
-- Name: PropertyTeamAssignment_propertyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PropertyTeamAssignment_propertyId_idx" ON public."PropertyTeamAssignment" USING btree ("propertyId");

--
-- Name: PropertyTeamAssignment_propertyId_roleId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PropertyTeamAssignment_propertyId_roleId_key" ON public."PropertyTeamAssignment" USING btree ("propertyId", "roleId");

--
-- Name: PropertyTeamAssignment_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PropertyTeamAssignment_userId_idx" ON public."PropertyTeamAssignment" USING btree ("userId");

--
-- Name: Property_leadNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Property_leadNumber_key" ON public."Property" USING btree ("leadNumber");

--
-- Name: Role_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Role_name_key" ON public."Role" USING btree (name);

--
-- Name: SavedFilter_userId_name_pipeline_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SavedFilter_userId_name_pipeline_key" ON public."SavedFilter" USING btree ("userId", name, pipeline);

--
-- Name: StatusAutomation_workspaceType_stageCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StatusAutomation_workspaceType_stageCode_key" ON public."StatusAutomation" USING btree ("workspaceType", "stageCode");

--
-- Name: Tag_name_category_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Tag_name_category_key" ON public."Tag" USING btree (name, category);

--
-- Name: TwilioNumber_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TwilioNumber_number_key" ON public."TwilioNumber" USING btree (number);

--
-- Name: UserCampaignAssignment_campaignId_roleId_assignNewLeads_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserCampaignAssignment_campaignId_roleId_assignNewLeads_idx" ON public."UserCampaignAssignment" USING btree ("campaignId", "roleId", "assignNewLeads");

--
-- Name: UserCampaignAssignment_userId_roleId_campaignId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UserCampaignAssignment_userId_roleId_campaignId_key" ON public."UserCampaignAssignment" USING btree ("userId", "roleId", "campaignId");

--
-- Name: UserRoleConfig_roleId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserRoleConfig_roleId_idx" ON public."UserRoleConfig" USING btree ("roleId");

--
-- Name: UserRoleConfig_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserRoleConfig_userId_idx" ON public."UserRoleConfig" USING btree ("userId");

--
-- Name: UserRoleConfig_userId_roleId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UserRoleConfig_userId_roleId_key" ON public."UserRoleConfig" USING btree ("userId", "roleId");

--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

--
-- Name: Vendor_contactId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Vendor_contactId_key" ON public."Vendor" USING btree ("contactId");

--
-- Name: WebFormConfig_entityType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "WebFormConfig_entityType_key" ON public."WebFormConfig" USING btree ("entityType");

--
-- Name: unique_normalized_address_when_not_null; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_normalized_address_when_not_null ON public."Property" USING btree ("normalizedAddress") WHERE ("normalizedAddress" IS NOT NULL);

--
-- Name: ActiveCall ActiveCall_agentUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActiveCall"
    ADD CONSTRAINT "ActiveCall_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: ActiveCall ActiveCall_leadCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActiveCall"
    ADD CONSTRAINT "ActiveCall_leadCampaignId_fkey" FOREIGN KEY ("leadCampaignId") REFERENCES public."LeadCampaign"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: ActiveCall ActiveCall_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActiveCall"
    ADD CONSTRAINT "ActiveCall_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: ActivityLog ActivityLog_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityLog"
    ADD CONSTRAINT "ActivityLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: ActivityLog ActivityLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ActivityLog"
    ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: AiLog AiLog_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiLog"
    ADD CONSTRAINT "AiLog_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Appointment Appointment_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Appointment"
    ADD CONSTRAINT "Appointment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: AutomationAction AutomationAction_automationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationAction"
    ADD CONSTRAINT "AutomationAction_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES public."Automation"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: BuyerCriteria BuyerCriteria_buyerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BuyerCriteria"
    ADD CONSTRAINT "BuyerCriteria_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES public."Buyer"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: BuyerMatch BuyerMatch_buyerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BuyerMatch"
    ADD CONSTRAINT "BuyerMatch_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES public."Buyer"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BuyerMatch BuyerMatch_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BuyerMatch"
    ADD CONSTRAINT "BuyerMatch_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BuyerOffer BuyerOffer_buyerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BuyerOffer"
    ADD CONSTRAINT "BuyerOffer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES public."Buyer"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: BuyerOffer BuyerOffer_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BuyerOffer"
    ADD CONSTRAINT "BuyerOffer_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Buyer Buyer_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Buyer"
    ADD CONSTRAINT "Buyer_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: CampaignEnrollment CampaignEnrollment_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignEnrollment"
    ADD CONSTRAINT "CampaignEnrollment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."Campaign"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: CampaignEnrollment CampaignEnrollment_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignEnrollment"
    ADD CONSTRAINT "CampaignEnrollment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: CampaignStep CampaignStep_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignStep"
    ADD CONSTRAINT "CampaignStep_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."Campaign"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Campaign Campaign_marketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaign"
    ADD CONSTRAINT "Campaign_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES public."Market"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Conversation Conversation_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Conversation Conversation_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: EsignDocument EsignDocument_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EsignDocument"
    ADD CONSTRAINT "EsignDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."EsignTemplate"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: FinancialGoal FinancialGoal_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FinancialGoal"
    ADD CONSTRAINT "FinancialGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: FinancialTransaction FinancialTransaction_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FinancialTransaction"
    ADD CONSTRAINT "FinancialTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."FinancialAccount"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: FinancialTransaction FinancialTransaction_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FinancialTransaction"
    ADD CONSTRAINT "FinancialTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."AccountTag"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: GlobalFile GlobalFile_folderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GlobalFile"
    ADD CONSTRAINT "GlobalFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES public."GlobalFolder"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: LeadCampaignRoleToggle LeadCampaignRoleToggle_leadCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadCampaignRoleToggle"
    ADD CONSTRAINT "LeadCampaignRoleToggle_leadCampaignId_fkey" FOREIGN KEY ("leadCampaignId") REFERENCES public."LeadCampaign"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: LeadCampaignRoleToggle LeadCampaignRoleToggle_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadCampaignRoleToggle"
    ADD CONSTRAINT "LeadCampaignRoleToggle_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: LeadCampaignUser LeadCampaignUser_leadCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadCampaignUser"
    ADD CONSTRAINT "LeadCampaignUser_leadCampaignId_fkey" FOREIGN KEY ("leadCampaignId") REFERENCES public."LeadCampaign"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: LeadCampaignUser LeadCampaignUser_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadCampaignUser"
    ADD CONSTRAINT "LeadCampaignUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: LeadCampaign LeadCampaign_leadSourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadCampaign"
    ADD CONSTRAINT "LeadCampaign_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES public."LeadSource"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: LeadCampaign LeadCampaign_phoneNumberId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadCampaign"
    ADD CONSTRAINT "LeadCampaign_phoneNumberId_fkey" FOREIGN KEY ("phoneNumberId") REFERENCES public."TwilioNumber"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: LeadOffer LeadOffer_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LeadOffer"
    ADD CONSTRAINT "LeadOffer_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Message Message_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Message Message_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Message Message_leadCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_leadCampaignId_fkey" FOREIGN KEY ("leadCampaignId") REFERENCES public."LeadCampaign"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Message Message_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Message Message_sentById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Note Note_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Note"
    ADD CONSTRAINT "Note_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Notification Notification_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PropertyContact PropertyContact_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PropertyContact"
    ADD CONSTRAINT "PropertyContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: PropertyContact PropertyContact_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PropertyContact"
    ADD CONSTRAINT "PropertyContact_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PropertyFile PropertyFile_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PropertyFile"
    ADD CONSTRAINT "PropertyFile_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PropertyTeamAssignment PropertyTeamAssignment_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PropertyTeamAssignment"
    ADD CONSTRAINT "PropertyTeamAssignment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PropertyTeamAssignment PropertyTeamAssignment_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PropertyTeamAssignment"
    ADD CONSTRAINT "PropertyTeamAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: PropertyTeamAssignment PropertyTeamAssignment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PropertyTeamAssignment"
    ADD CONSTRAINT "PropertyTeamAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Property Property_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Property"
    ADD CONSTRAINT "Property_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Property Property_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Property"
    ADD CONSTRAINT "Property_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Property Property_dispoAssigneeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Property"
    ADD CONSTRAINT "Property_dispoAssigneeId_fkey" FOREIGN KEY ("dispoAssigneeId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Property Property_leadCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Property"
    ADD CONSTRAINT "Property_leadCampaignId_fkey" FOREIGN KEY ("leadCampaignId") REFERENCES public."LeadCampaign"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Property Property_marketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Property"
    ADD CONSTRAINT "Property_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES public."Market"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: SavedFilter SavedFilter_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SavedFilter"
    ADD CONSTRAINT "SavedFilter_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: StageHistory StageHistory_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StageHistory"
    ADD CONSTRAINT "StageHistory_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: Task Task_assignedToId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Task Task_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: Task Task_propertyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Task"
    ADD CONSTRAINT "Task_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES public."Property"(id) ON UPDATE CASCADE ON DELETE SET NULL;

--
-- Name: UserCampaignAssignment UserCampaignAssignment_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserCampaignAssignment"
    ADD CONSTRAINT "UserCampaignAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."LeadCampaign"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: UserCampaignAssignment UserCampaignAssignment_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserCampaignAssignment"
    ADD CONSTRAINT "UserCampaignAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: UserCampaignAssignment UserCampaignAssignment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserCampaignAssignment"
    ADD CONSTRAINT "UserCampaignAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: UserRoleConfig UserRoleConfig_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRoleConfig"
    ADD CONSTRAINT "UserRoleConfig_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: UserRoleConfig UserRoleConfig_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRoleConfig"
    ADD CONSTRAINT "UserRoleConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- Name: User User_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

--
-- Name: Vendor Vendor_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Vendor"
    ADD CONSTRAINT "Vendor_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contact"(id) ON UPDATE CASCADE ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--

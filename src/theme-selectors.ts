export type ThemeSelectorCandidateSource =
  | "klack-hook"
  | "slack-data"
  | "slack-aria"
  | "slack-class"
  | "slack-structural"
  | "slack-generated";

export type ThemeSelectorStability =
  | "owned"
  | "stable"
  | "semantic"
  | "structural"
  | "fallback";

export type ThemeSelectorCardinality = "exactly-one" | "one-or-more" | "zero-or-one" | "optional";

export type ThemeSelectorCandidate = {
  selector: string;
  source: ThemeSelectorCandidateSource;
  stability: ThemeSelectorStability;
};

export type ThemeSelectorDefinition = {
  candidates: readonly ThemeSelectorCandidate[];
  cardinality: ThemeSelectorCardinality;
  description: string;
  required?: boolean;
  surface: string;
};

type SelectorOptions = {
  cardinality?: ThemeSelectorCardinality;
  required?: boolean;
  surface: string;
};

const candidate = (
  selector: string,
  source: ThemeSelectorCandidateSource,
  stability: ThemeSelectorStability,
): ThemeSelectorCandidate => ({ selector, source, stability });

const qa = (name: string): ThemeSelectorCandidate =>
  candidate(`[data-qa="${name}"]`, "slack-data", "stable");
const aria = (selector: string): ThemeSelectorCandidate =>
  candidate(selector, "slack-aria", "stable");
const slackClass = (selector: string): ThemeSelectorCandidate =>
  candidate(selector, "slack-class", "semantic");
const structural = (selector: string): ThemeSelectorCandidate =>
  candidate(selector, "slack-structural", "structural");
const generated = (selector: string): ThemeSelectorCandidate =>
  candidate(selector, "slack-generated", "fallback");
const klack = (selector: string): ThemeSelectorCandidate =>
  candidate(selector, "klack-hook", "owned");

const selector = (
  description: string,
  candidates: readonly ThemeSelectorCandidate[],
  options: SelectorOptions,
): ThemeSelectorDefinition => ({
  candidates,
  cardinality: options.cardinality || "optional",
  description,
  required: options.required,
  surface: options.surface,
});

export const THEME_SELECTORS = {
  "slack.app.root": selector("Slack's main application root.", [slackClass(".p-ia4_client")], {
    cardinality: "exactly-one",
    required: true,
    surface: "app",
  }),
  "slack.workspace.wrapper": selector("Outer workspace wrapper.", [slackClass(".p-client_workspace_wrapper")], {
    cardinality: "exactly-one",
    required: true,
    surface: "workspace",
  }),
  "slack.workspace.shell": selector("Workspace shell.", [slackClass(".p-client_workspace")], {
    cardinality: "exactly-one",
    required: true,
    surface: "workspace",
  }),
  "slack.workspace.layout": selector("Workspace layout grid.", [slackClass(".p-client_workspace__layout")], {
    cardinality: "exactly-one",
    required: true,
    surface: "workspace",
  }),
  "slack.workspace.tabpanel": selector("Workspace tab panel.", [slackClass(".p-client_workspace__tabpanel")], {
    cardinality: "exactly-one",
    surface: "workspace",
  }),
  "slack.workspace.sidebar-pane": selector("Left workspace pane.", [slackClass(".p-view_contents--sidebar")], {
    cardinality: "exactly-one",
    surface: "workspace",
  }),
  "slack.workspace.primary-pane": selector("Primary workspace pane.", [slackClass(".p-view_contents--primary")], {
    cardinality: "zero-or-one",
    surface: "workspace",
  }),
  "slack.workspace.primary-body": selector("Primary workspace view body.", [slackClass(".p-workspace__primary_view_body")], {
    cardinality: "exactly-one",
    surface: "workspace",
  }),
  "slack.workspace.secondary-pane": selector("Secondary workspace pane.", [slackClass(".p-view_contents--secondary")], {
    cardinality: "zero-or-one",
    surface: "workspace",
  }),
  "slack.workspace.primary-footer": selector("Primary workspace footer.", [slackClass(".workspace__primary_view_footer")], {
    cardinality: "zero-or-one",
    surface: "workspace",
  }),
  "slack.workspace.team-sidebar": selector("Workspace team rail.", [slackClass(".p-client__team_sidebar")], {
    cardinality: "zero-or-one",
    surface: "workspace",
  }),
  "slack.workspace.switcher": selector("Workspace switcher.", [slackClass(".p-workspace_switcher_prototype")], {
    cardinality: "zero-or-one",
    surface: "workspace",
  }),
  "slack.workspace.tab-rail": selector("Workspace app tab rail.", [slackClass(".p-tab_rail")], {
    cardinality: "zero-or-one",
    surface: "workspace",
  }),
  "slack.workspace.control-strip": selector("Workspace control strip.", [slackClass(".p-control_strip")], {
    cardinality: "zero-or-one",
    surface: "workspace",
  }),
  "slack.workspace.banners": selector(
    "Workspace-level banners.",
    [slackClass(".p-client__banners"), slackClass(".p-ia__workspace_banner")],
    { surface: "workspace" },
  ),

  "slack.top-nav.root": selector(
    "Top navigation toolbar.",
    [qa("top-nav"), aria('[role="toolbar"][aria-label="History Navigation"]'), slackClass(".p-ia4_top_nav")],
    { cardinality: "exactly-one", required: true, surface: "top-nav" },
  ),
  "slack.top-nav.search-container": selector("Top navigation search wrapper.", [slackClass(".p-top_nav__search__container")], {
    cardinality: "exactly-one",
    surface: "top-nav",
  }),
  "slack.top-nav.search-trigger": selector(
    "Top navigation search button.",
    [qa("top_nav_search"), aria('button[aria-label="Search"]'), slackClass(".p-top_nav__search")],
    { cardinality: "exactly-one", required: true, surface: "top-nav" },
  ),
  "slack.top-nav.search-icon": selector("Top navigation search icon.", [slackClass(".p-top_nav__search__icon")], {
    cardinality: "exactly-one",
    surface: "top-nav",
  }),
  "slack.top-nav.search-text": selector("Top navigation search label.", [slackClass(".p-top_nav__search__text")], {
    cardinality: "exactly-one",
    surface: "top-nav",
  }),
  "slack.top-nav.help-button": selector("Top navigation help button container.", [qa("top-nav-help-button")], {
    cardinality: "zero-or-one",
    surface: "top-nav",
  }),
  "slack.top-nav.workspace-name": selector("Workspace name in the top navigation.", [slackClass(".p-ia4_home_header_menu__team_name")], {
    cardinality: "zero-or-one",
    surface: "top-nav",
  }),
  "slack.top-nav.workspace-actions": selector("Workspace actions button.", [qa("workspace_actions_button")], {
    cardinality: "zero-or-one",
    surface: "top-nav",
  }),
  "slack.top-nav.split-view-action": selector("Move-to-split-view action.", [qa("move-to-split-view")], {
    cardinality: "zero-or-one",
    surface: "top-nav",
  }),

  "slack.sidebar.channel-list-shell": selector("Channel-list panel shell.", [slackClass(".p-ia4_channel_list")], {
    cardinality: "exactly-one",
    required: true,
    surface: "sidebar",
  }),
  "slack.sidebar.root": selector("Channel sidebar root.", [qa("channel-sidebar"), slackClass(".p-channel_sidebar")], {
    cardinality: "exactly-one",
    required: true,
    surface: "sidebar",
  }),
  "slack.sidebar.list": selector("Channel sidebar list.", [slackClass(".p-channel_sidebar__list")], {
    cardinality: "exactly-one",
    surface: "sidebar",
  }),
  "slack.sidebar.virtual-item": selector(
    "A virtualized sidebar row.",
    [qa("virtual-list-item"), aria('[role="treeitem"]')],
    { cardinality: "one-or-more", surface: "sidebar" },
  ),
  "slack.sidebar.section-heading": selector(
    "Channel sidebar section heading.",
    [slackClass(".p-channel_sidebar__section_heading"), structural('[data-qa^="channel_sidebar__section_heading_label__"]')],
    { surface: "sidebar" },
  ),
  "slack.sidebar.item": selector(
    "Any channel or route item in the sidebar.",
    [qa("channel-sidebar-channel"), slackClass(".p-channel_sidebar__channel"), slackClass(".p-channel_sidebar__link")],
    { cardinality: "one-or-more", surface: "sidebar" },
  ),
  "slack.sidebar.channel-item": selector(
    "A channel or direct-message sidebar item.",
    [qa("channel-sidebar-channel"), slackClass(".p-channel_sidebar__channel")],
    { surface: "sidebar" },
  ),
  "slack.sidebar.route-item": selector("A sidebar route item.", [slackClass(".p-channel_sidebar__link")], {
    surface: "sidebar",
  }),
  "slack.sidebar.item-name": selector("Sidebar item label.", [slackClass(".p-channel_sidebar__name")], {
    surface: "sidebar",
  }),
  "slack.sidebar.item-icon": selector(
    "Sidebar item leading icon.",
    [slackClass(".p-channel_sidebar__channel_icon_prefix"), slackClass(".p-channel_sidebar__link__icon")],
    { surface: "sidebar" },
  ),
  "slack.sidebar.item-suffix": selector("Sidebar item trailing region.", [slackClass(".p-channel_sidebar__channel_suffix")], {
    surface: "sidebar",
  }),
  "slack.sidebar.mention-badge": selector("Sidebar mention badge.", [slackClass(".c-mention_badge")], {
    surface: "sidebar",
  }),
  "slack.sidebar.item-selected": selector(
    "Selected sidebar item.",
    [slackClass(".p-channel_sidebar__channel--selected"), slackClass(".p-channel_sidebar__link--selected")],
    { cardinality: "zero-or-one", surface: "sidebar" },
  ),
  "slack.sidebar.item-unread": selector(
    "Unread sidebar item.",
    [slackClass(".p-channel_sidebar__channel--unread"), slackClass(".p-channel_sidebar__link--unread")],
    { surface: "sidebar" },
  ),
  "slack.sidebar.conversation-filter": selector("Conversation filter input.", [qa("sidebar-text-filter-input")], {
    cardinality: "zero-or-one",
    surface: "sidebar",
  }),

  "slack.channel-header.root": selector(
    "Primary view header.",
    [qa("view_header"), aria('[role="toolbar"][aria-label="Primary view actions"]'), slackClass(".p-view_header")],
    { cardinality: "exactly-one", required: true, surface: "channel-header" },
  ),
  "slack.channel-header.text-group": selector("Header title and topic group.", [slackClass(".p-view_header__text")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.title-control": selector(
    "Channel title and details control.",
    [qa("channel_name_button"), aria('button[aria-label^="Channel details for "]'), slackClass(".p-view_header__big_button")],
    { cardinality: "zero-or-one", surface: "channel-header" },
  ),
  "slack.channel-header.title": selector(
    "Channel, member, or view title.",
    [qa("channel_name"), slackClass(".p-view_header__channel_title"), slackClass(".p-view_header__member_name"), slackClass(".p-ia__view_header__title")],
    { cardinality: "zero-or-one", surface: "channel-header" },
  ),
  "slack.channel-header.topic-container": selector("Channel topic wrapper.", [slackClass(".p-view_header__topic_container")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.topic": selector("Channel topic.", [slackClass(".p-view_header__topic")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.actions": selector("Channel header action group.", [slackClass(".p-view_header__actions")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.favorite-action": selector("Favorite/star channel action.", [qa("entity-header-star-button")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.huddle-action": selector("Channel huddle action.", [qa("huddle_channel_header_button")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.tabs": selector(
    "Channel views tab list.",
    [aria('[role="tablist"][aria-label$=" views"]'), structural('[role="tablist"]:has([data-qa="channel"][role="tab"])')],
    { cardinality: "zero-or-one", surface: "channel-header" },
  ),
  "slack.channel-header.tab": selector("A channel view tab.", [structural('[data-qa="channel"][role="tab"]')], {
    surface: "channel-header",
  }),
  "slack.channel-header.top-banners": selector("Message-pane top banner region.", [slackClass(".p-message_pane__top_banners")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.bookmark-banners": selector("Bookmark banner region.", [slackClass(".p-message_pane__banners_with_bookmarks_bar")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.education-banner": selector("Channel education banner.", [slackClass(".p-scdm_education_launcher")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.context-bar": selector("Channel context banner.", [qa("context_bar")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.shared-context-text": selector("External-organization context text.", [qa("context_bar_text_shared")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.dnd-context-text": selector("Paused-notifications context text.", [qa("context_bar_dnd_text")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.shared-context-icon": selector("External-organization context icon group.", [qa("shared_channel_connection_info_icon")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),
  "slack.channel-header.connected-info": selector("Connected-channel information banner.", [qa("message-pane-channel-connected-info")], {
    cardinality: "zero-or-one",
    surface: "channel-header",
  }),

  "slack.message.pane": selector("Primary message transcript pane.", [qa("message_pane"), slackClass(".p-message_pane")], {
    cardinality: "exactly-one",
    required: true,
    surface: "message",
  }),
  "slack.message.scroll": selector("Message transcript scroll container.", [slackClass(".c-virtual_list__scroll_container")], {
    cardinality: "one-or-more",
    surface: "message",
  }),
  "slack.message.foreword": selector("Conversation foreword.", [slackClass(".p-message_pane__foreword")], {
    cardinality: "zero-or-one",
    surface: "message",
  }),
  "slack.message.foreword-title": selector("Conversation foreword title.", [slackClass(".p-message_pane__foreword__title")], {
    cardinality: "zero-or-one",
    surface: "message",
  }),
  "slack.message.row": selector("One rendered Slack message.", [qa("message_container"), slackClass(".c-message_kit__message")], {
    cardinality: "one-or-more",
    required: true,
    surface: "message",
  }),
  "slack.message.gutter": selector("Message layout gutter.", [slackClass(".c-message_kit__gutter")], {
    surface: "message",
  }),
  "slack.message.gutter-left": selector("Message avatar gutter.", [slackClass(".c-message_kit__gutter__left")], {
    surface: "message",
  }),
  "slack.message.gutter-right": selector("Message content gutter.", [slackClass(".c-message_kit__gutter__right")], {
    surface: "message",
  }),
  "slack.message.indent": selector("Message content layout wrapper.", [slackClass(".c-message_kit__indent")], {
    surface: "message",
  }),
  "slack.message.header": selector("Message sender and timestamp header.", [slackClass(".c-message__header")], {
    surface: "message",
  }),
  "slack.message.sender": selector("Message sender container.", [qa("message_sender")], {
    surface: "message",
  }),
  "slack.message.sender-name": selector("Message sender name.", [qa("message_sender_name")], {
    surface: "message",
  }),
  "slack.message.timestamp": selector("Message timestamp.", [slackClass(".c-timestamp")], {
    surface: "message",
  }),
  "slack.message.timestamp-label": selector("Message timestamp label.", [qa("timestamp_label")], {
    surface: "message",
  }),
  "slack.message.body": selector("Message text body.", [qa("message-text"), slackClass(".c-message__body")], {
    required: true,
    surface: "message",
  }),
  "slack.message.rich-text": selector("Rich-text section.", [slackClass(".p-rich_text_section")], {
    surface: "message",
  }),
  "slack.message.block-kit-inline": selector("Inline Block Kit renderer.", [slackClass(".p-block_kit_renderer--inline")], {
    surface: "message",
  }),
  "slack.message.user-mention": selector(
    "User mention across Slack renderer generations.",
    [slackClass(".c-mrkdwn__mention"), slackClass(".c-member_slug"), slackClass(".p-rich_text_slug"), structural('[data-stringify-type="mention"]')],
    { surface: "message" },
  ),
  "slack.message.user-group-mention": selector("User-group mention.", [slackClass(".c-mrkdwn__user_group")], {
    surface: "message",
  }),
  "slack.message.truncated-link": selector("Truncated rich-text link.", [qa("rich_text_truncated_link_element")], {
    surface: "message",
  }),
  "slack.message.custom-status": selector("Custom status shown with a message.", [slackClass(".c-custom_status")], {
    surface: "message",
  }),
  "slack.message.reactions": selector("Message reaction bar.", [slackClass(".c-reaction_bar")], {
    surface: "message",
  }),
  "slack.message.reply-bar": selector("Message thread-reply summary.", [slackClass(".c-message__reply_bar")], {
    surface: "message",
  }),
  "slack.message.actions": selector("Message action toolbar.", [slackClass(".c-message_actions__container")], {
    surface: "message",
  }),
  "slack.message.day-divider": selector("Transcript day divider.", [slackClass(".c-message_list__day_divider")], {
    surface: "message",
  }),
  "slack.message.day-divider-line": selector("Transcript day-divider rule.", [slackClass(".c-message_list__day_divider__line")], {
    surface: "message",
  }),
  "slack.message.day-divider-label": selector("Transcript day-divider label.", [slackClass(".c-message_list__day_divider__label")], {
    surface: "message",
  }),
  "slack.message.day-divider-pill": selector("Transcript day-divider label pill.", [slackClass(".c-message_list__day_divider__label__pill")], {
    surface: "message",
  }),
  "slack.message.unread-divider": selector("Transcript unread divider.", [slackClass(".c-message_list__unread_divider")], {
    surface: "message",
  }),
  "slack.message.unread-divider-label": selector("Transcript unread-divider label.", [slackClass(".c-message_list__unread_divider__label")], {
    surface: "message",
  }),

  "slack.attachment.collection": selector("Message attachment collection.", [slackClass(".c-message_kit__attachments")], {
    surface: "attachment",
  }),
  "slack.attachment.legacy": selector("Legacy message attachment.", [slackClass(".c-message_attachment")], {
    surface: "attachment",
  }),
  "slack.attachment.v2": selector("Second-generation message attachment.", [slackClass(".c-message_attachment_v2")], {
    surface: "attachment",
  }),
  "slack.attachment.border": selector("Attachment border.", [slackClass(".c-message_attachment__border")], {
    surface: "attachment",
  }),
  "slack.attachment.body": selector("Attachment body.", [slackClass(".c-message_attachment__body")], {
    surface: "attachment",
  }),
  "slack.attachment.row": selector("Attachment row.", [slackClass(".c-message_attachment__row")], {
    surface: "attachment",
  }),
  "slack.attachment.footer": selector("Attachment footer.", [slackClass(".c-message_attachment__footer")], {
    surface: "attachment",
  }),
  "slack.attachment.pretext": selector("Attachment pretext.", [slackClass(".c-message_attachment__pretext")], {
    surface: "attachment",
  }),
  "slack.attachment.text": selector("Attachment text.", [slackClass(".c-message_attachment__text")], {
    surface: "attachment",
  }),
  "slack.attachment.title": selector("Attachment title.", [slackClass(".c-message_attachment__title")], {
    surface: "attachment",
  }),
  "slack.attachment.author-name": selector("Attachment author name.", [slackClass(".c-message_attachment__author_name")], {
    surface: "attachment",
  }),
  "slack.attachment.action": selector("Attachment action button.", [qa("message_attachment_button")], {
    surface: "attachment",
  }),
  "slack.attachment.media": selector("Attachment media region.", [slackClass(".c-message_attachment__media")], {
    surface: "attachment",
  }),
  "slack.attachment.media-container": selector("Attachment media wrapper.", [slackClass(".c-message_attachment__media_container")], {
    surface: "attachment",
  }),
  "slack.attachment.preview": selector("Attachment preview.", [slackClass(".c-message_attachment__preview")], {
    surface: "attachment",
  }),
  "slack.attachment.image-container": selector("Attachment image wrapper.", [slackClass(".c-message_attachment__image_container")], {
    surface: "attachment",
  }),
  "slack.attachment.image": selector(
    "Attachment or unfurl image.",
    [qa("unfurl_image"), slackClass(".c-message_attachment__image")],
    { surface: "attachment" },
  ),
  "slack.attachment.slack-message-preview": selector("Linked Slack message preview text.", [qa("message_attachment_slack_msg_text")], {
    surface: "attachment",
  }),

  "slack.file.collection": selector("Uploaded-file collection.", [slackClass(".c-files_container")], {
    surface: "file",
  }),
  "slack.file.image-thumbnail": selector(
    "Uploaded image thumbnail.",
    [qa("message_file_image_thumbnail"), slackClass(".p-file_image_thumbnail")],
    { surface: "file" },
  ),
  "slack.file.image": selector("Uploaded image element.", [slackClass(".p-file_image_thumbnail__image")], {
    surface: "file",
  }),
  "slack.file.tiny-thumbnail": selector("Tiny uploaded-image placeholder.", [slackClass(".p-file_image_thumbnail__tiny_thumb_wrapper")], {
    surface: "file",
  }),
  "slack.file.video": selector("Video message file.", [slackClass(".p-video_message_file")], {
    surface: "file",
  }),
  "slack.file.meta": selector("Uploaded-file metadata.", [slackClass(".c-message_kit__file__meta")], {
    surface: "file",
  }),
  "slack.file.snippet": selector("Expanded uploaded-file snippet.", [slackClass(".c-pillow_file__snippet")], {
    surface: "file",
  }),

  "slack.code.block": selector("Markdown code block.", [slackClass(".c-mrkdwn__pre")], {
    surface: "code",
  }),
  "slack.code.block-header": selector("Code-block header.", [generated('[class*="header__"]')], {
    surface: "code",
  }),
  "slack.code.block-content": selector("Code-block content.", [generated('[class*="code__"]')], {
    surface: "code",
  }),
  "slack.code.line-number": selector("Code-block line number.", [slackClass(".line-number")], {
    surface: "code",
  }),
  "slack.block-kit.renderer": selector("Block Kit renderer.", [slackClass(".p-block_kit_renderer")], {
    surface: "block-kit",
  }),
  "slack.block-kit.toggle": selector("Block Kit disclosure toggle.", [generated('[class*="toggleBarButton__"]')], {
    surface: "block-kit",
  }),
  "slack.block-kit.toggle-title": selector("Block Kit disclosure title.", [generated('[class*="headerTitle__"]')], {
    surface: "block-kit",
  }),
  "slack.block-kit.toggle-icon": selector("Block Kit disclosure icon.", [generated('[class*="toggleBarIcon__"]')], {
    surface: "block-kit",
  }),

  "slack.composer.container": selector("Message composer container.", [qa("message_input_container"), slackClass(".p-message_pane_input")], {
    cardinality: "zero-or-one",
    required: true,
    surface: "composer",
  }),
  "slack.composer.inner": selector("Message composer inner shell.", [slackClass(".p-message_pane_input_inner")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.notification": selector("Composer notification bar.", [slackClass(".p-notification_bar")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.editor-shell": selector("Composer WYSIWYG shell.", [slackClass(".c-wysiwyg_container")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.formatting-toolbar": selector(
    "Composer formatting toolbar.",
    [qa("wysiwyg-container_formatting-enabled"), aria('[role="toolbar"][aria-label="Formatting"]'), slackClass(".c-wysiwyg_container__formatting")],
    { cardinality: "zero-or-one", surface: "composer" },
  ),
  "slack.composer.actions-toolbar": selector(
    "Composer action toolbar.",
    [aria('[role="toolbar"][aria-label="Composer actions"]'), slackClass(".c-wysiwyg_container__footer")],
    { cardinality: "zero-or-one", surface: "composer" },
  ),
  "slack.composer.input-shell": selector("Composer editor shell.", [slackClass(".c-texty_input_unstyled__container")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.input": selector(
    "Editable composer input.",
    [qa("texty_input"), aria('[role="textbox"][contenteditable="true"]')],
    { cardinality: "zero-or-one", required: true, surface: "composer" },
  ),
  "slack.composer.placeholder": selector(
    "Composer placeholder across editor implementations.",
    [slackClass(".c-texty_input__placeholder"), slackClass(".ql-placeholder")],
    { surface: "composer" },
  ),
  "slack.composer.preview": selector("Composer reply/edit preview.", [slackClass(".p-message_pane_input__preview")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.preview-subtitle": selector("Composer preview subtitle.", [slackClass(".p-message_pane_input__preview_subtitle")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.thread-typing": selector("Thread composer typing indicator.", [slackClass(".p-thread_footer_typing_indicator")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.broadcast-checkbox": selector("Thread broadcast checkbox.", [qa("threads_footer_broadcast_checkbox")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.broadcast-controls": selector("Thread broadcast controls.", [qa("threads_footer_broadcast_controls")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.page": selector("New-message composer page.", [qa("composer_page")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.page-subheader": selector("New-message page subheader.", [qa("composer-subheader")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.destination-input": selector("New-message destination input.", [slackClass(".c-multi_select_input")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.destination-list-wrapper": selector("Destination list popover.", [qa("composer_page__destination-options-list-wrapper")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),
  "slack.composer.destination-list": selector("Destination results list.", [qa("composer_page__destination-options-list")], {
    cardinality: "zero-or-one",
    surface: "composer",
  }),

  "slack.threads.view": selector("Threads route root.", [slackClass(".p-threads_view")], {
    cardinality: "zero-or-one",
    surface: "threads",
  }),
  "slack.threads.item": selector("Virtualized Threads route item.", [slackClass(".p-threads_view .c-virtual_list__item")], {
    surface: "threads",
  }),
  "slack.threads.card": selector(
    "Threads route card.",
    [qa("multi_thread_background"), slackClass(".p-multi_thread_background")],
    { surface: "threads" },
  ),
  "slack.threads.inner-root": selector("Threads route inner root.", [slackClass(".p-threads_view_root")], {
    cardinality: "zero-or-one",
    surface: "threads",
  }),
  "slack.threads.group-header": selector("Thread group header.", [slackClass(".p-threads_view_header")], {
    surface: "threads",
  }),
  "slack.threads.channel-name": selector("Thread group channel name.", [slackClass(".p-threads_view_header__channel_name")], {
    surface: "threads",
  }),
  "slack.threads.participants": selector("Thread participant list.", [slackClass(".p-threads_view_header__participant_list")], {
    surface: "threads",
  }),
  "slack.threads.page-title": selector(
    "Threads page title.",
    [qa("ia_view_header_threads"), slackClass(".p-ia__view_header__title")],
    { cardinality: "zero-or-one", surface: "threads" },
  ),
  "slack.threads.divider-line": selector("Thread group divider line.", [slackClass(".p-threads_view__divider_line")], {
    surface: "threads",
  }),
  "slack.threads.divider-label": selector("Thread group divider label.", [slackClass(".p-threads_view__divider_label")], {
    surface: "threads",
  }),
  "slack.threads.load-older": selector("Load older thread messages action.", [qa("load_older_message")], {
    cardinality: "zero-or-one",
    surface: "threads",
  }),
  "slack.threads.footer": selector("Threads route composer footer.", [slackClass(".p-threads_view__footer")], {
    cardinality: "zero-or-one",
    surface: "threads",
  }),
  "slack.threads.footer-input": selector("Threads route input wrapper.", [slackClass(".p-threads_footer__input_container")], {
    cardinality: "zero-or-one",
    surface: "threads",
  }),
  "slack.thread.pane": selector("Single-thread flexpane.", [slackClass(".p-threads_flexpane")], {
    cardinality: "zero-or-one",
    surface: "thread",
  }),
  "slack.thread.reply-container": selector("Thread reply composer region.", [qa("reply_container")], {
    cardinality: "zero-or-one",
    surface: "thread",
  }),
  "slack.thread.new-banner": selector("New thread activity banner.", [slackClass(".p-new_threads_banner")], {
    cardinality: "zero-or-one",
    surface: "thread",
  }),

  "slack.unreads.view": selector("All Unreads view.", [slackClass(".p-unreads_view")], {
    cardinality: "zero-or-one",
    surface: "unreads",
  }),
  "slack.unreads.new-header": selector("All Unreads new-items header.", [slackClass(".p-unreads_view__header--new")], {
    cardinality: "zero-or-one",
    surface: "unreads",
  }),
  "slack.unreads.header": selector("All Unreads header.", [slackClass(".p-all_unreads_header__header")], {
    cardinality: "zero-or-one",
    surface: "unreads",
  }),
  "slack.unreads.mark-read": selector("Mark all unread messages read action.", [slackClass(".p-unreads_view__header__mark_read_button")], {
    cardinality: "zero-or-one",
    surface: "unreads",
  }),
  "slack.unreads.empty": selector("All Unreads empty state.", [slackClass(".p-unreads_view__empty__message")], {
    cardinality: "zero-or-one",
    surface: "unreads",
  }),
  "slack.unreads.list-control": selector("All Unreads list control.", [slackClass(".p-unreads_view__list_control_button")], {
    surface: "unreads",
  }),
  "slack.unreads.refresh": selector("All Unreads refresh action.", [slackClass(".p-all_unreads_header__header__refresh_button")], {
    cardinality: "zero-or-one",
    surface: "unreads",
  }),

  "slack.search.view": selector("Search results view.", [qa("search_view")], {
    cardinality: "zero-or-one",
    surface: "search",
  }),
  "slack.search.filters": selector("Search filter region.", [qa("search_filters")], {
    cardinality: "zero-or-one",
    surface: "search",
  }),
  "slack.search.filters-container": selector(
    "Search filter toolbar background container.",
    [candidate("#filters-container", "slack-data", "stable")],
    { cardinality: "zero-or-one", surface: "search" },
  ),
  "slack.search.sort": selector("Search result sort toggle.", [qa("message_sort_toggle-button")], {
    cardinality: "zero-or-one",
    surface: "search",
  }),
  "slack.search.result": selector("Search result.", [qa("search_result")], {
    surface: "search",
  }),
  "slack.search.result-channel": selector("Search result channel name.", [qa("search_result_channel_name")], {
    surface: "search",
  }),
  "slack.search.result-expand": selector("Search result expansion control.", [qa("search_expand")], {
    surface: "search",
  }),
  "slack.search.dialog-input": selector("Search dialog input box.", [slackClass(".c-search__input_box")], {
    cardinality: "zero-or-one",
    surface: "search",
  }),
  "slack.search.dialog-input-container": selector("Search dialog input wrapper.", [slackClass(".c-search__input_box__container")], {
    cardinality: "zero-or-one",
    surface: "search",
  }),
  "slack.search.autocomplete-footer": selector("Search autocomplete footer.", [slackClass(".c-search_autocomplete__footer")], {
    cardinality: "zero-or-one",
    surface: "search",
  }),
  "slack.search.suggestion": selector("Search autocomplete suggestion.", [slackClass(".c-search_autocomplete__suggestion_item")], {
    surface: "search",
  }),
  "slack.search.suggestion-selected": selector("Selected search autocomplete suggestion.", [slackClass(".c-search_autocomplete__suggestion_item--pseudo-selected")], {
    cardinality: "zero-or-one",
    surface: "search",
  }),
  "slack.search.token": selector("Search query token.", [slackClass(".c-search_query_entity__token")], {
    surface: "search",
  }),
  "slack.search.token-label": selector("Search query token label.", [slackClass(".c-search_query_entity__token_label")], {
    surface: "search",
  }),
  "slack.search.filter-action": selector("Search input filter action.", [slackClass(".c-search__input_and_close__filter")], {
    surface: "search",
  }),

  "slack.flexpane.root": selector("Secondary flexpane root.", [slackClass(".p-flexpane")], {
    cardinality: "zero-or-one",
    surface: "flexpane",
  }),
  "slack.flexpane.body": selector("Secondary flexpane body.", [slackClass(".p-flexpane__body")], {
    cardinality: "zero-or-one",
    surface: "flexpane",
  }),
  "slack.flexpane.header": selector("Secondary flexpane header.", [slackClass(".p-flexpane_header")], {
    cardinality: "zero-or-one",
    surface: "flexpane",
  }),
  "slack.flexpane.title": selector(
    "Secondary flexpane title.",
    [qa("flexpane-title-container"), slackClass(".p-flexpane_header__primary")],
    { cardinality: "zero-or-one", surface: "flexpane" },
  ),
  "slack.member-profile.pane": selector("Member profile pane.", [qa("member_profile_pane")], {
    cardinality: "zero-or-one",
    surface: "member-profile",
  }),
  "slack.member-profile.avatar-content": selector("Member profile avatar region.", [slackClass(".p-r_member_profile__avatar_content")], {
    cardinality: "zero-or-one",
    surface: "member-profile",
  }),
  "slack.member-profile.avatar-container": selector("Member profile avatar wrapper.", [slackClass(".p-r_member_profile__avatar__img_container")], {
    cardinality: "zero-or-one",
    surface: "member-profile",
  }),
  "slack.member-profile.avatar": selector("Member profile avatar.", [slackClass(".p-r_member_profile__avatar__img")], {
    cardinality: "zero-or-one",
    surface: "member-profile",
  }),
  "slack.member-profile.section": selector("Member profile section.", [slackClass(".p-r_member_profile_section")], {
    surface: "member-profile",
  }),
  "slack.member-profile.name": selector("Member profile name.", [slackClass(".p-r_member_profile__name__text")], {
    cardinality: "zero-or-one",
    surface: "member-profile",
  }),
  "slack.member-profile.section-header": selector("Member profile section heading.", [slackClass(".p-r_member_profile_section_header")], {
    surface: "member-profile",
  }),
  "slack.member-profile.action": selector("Member profile action.", [slackClass(".p-member_profile_buttons__button")], {
    surface: "member-profile",
  }),
  "slack.member-profile.action-label": selector("Member profile action label.", [slackClass(".p-member_profile_buttons__button_body_label")], {
    surface: "member-profile",
  }),
  "slack.member-hover.popover": selector("Member hover-card popover.", [slackClass(".p-member_profile_hover_card__popover")], {
    cardinality: "zero-or-one",
    surface: "member-hover",
  }),
  "slack.member-hover.card": selector("Member hover card.", [slackClass(".p-member_profile_hover_card__container")], {
    cardinality: "zero-or-one",
    surface: "member-hover",
  }),
  "slack.member-hover.primary": selector("Member hover-card primary region.", [slackClass(".p-member_profile_base_entity__primary")], {
    cardinality: "zero-or-one",
    surface: "member-hover",
  }),
  "slack.member-hover.secondary": selector("Member hover-card secondary region.", [slackClass(".p-member_profile_hover_card__secondary")], {
    cardinality: "zero-or-one",
    surface: "member-hover",
  }),
  "slack.member-hover.title": selector("Member hover-card title.", [slackClass(".p-member_profile_base_entity__title--full")], {
    cardinality: "zero-or-one",
    surface: "member-hover",
  }),
  "slack.entity.avatar": selector("Generic Slack avatar.", [slackClass(".c-avatar"), slackClass(".c-base_icon")], {
    surface: "entity",
  }),
  "slack.entity.subtext": selector("Generic entity supporting text.", [slackClass(".c-base_entity__subtext")], {
    surface: "entity",
  }),
  "slack.entity.text": selector("Generic entity text.", [slackClass(".c-base_entity__text")], {
    surface: "entity",
  }),
  "slack.entity.avatar-container": selector("Generic entity avatar wrapper.", [slackClass(".c-base_entity__avatar-container")], {
    surface: "entity",
  }),

  "slack.dialog.root": selector("Slack modal dialog.", [structural('.ReactModal__Content[role="dialog"]')], {
    cardinality: "optional",
    surface: "dialog",
  }),
  "slack.dialog.body": selector(
    "Slack dialog content body.",
    [qa("sk-modal-content"), slackClass(".c-sk-modal_content")],
    { surface: "dialog" },
  ),
  "slack.dialog.header": selector("Slack dialog header.", [slackClass(".c-sk-modal_header")], {
    surface: "dialog",
  }),
  "slack.preferences.root": selector("Slack preferences dialog.", [slackClass(".p-prefs_dialog__modal")], {
    cardinality: "zero-or-one",
    surface: "preferences",
  }),
  "slack.preferences.close": selector("Preferences close action.", [qa("sk_close_modal_button")], {
    cardinality: "zero-or-one",
    surface: "preferences",
  }),
  "slack.preferences.theme-section": selector("Slack theme preferences section.", [qa("ia4-theming-section")], {
    cardinality: "zero-or-one",
    surface: "preferences",
  }),
  "slack.tabs.content": selector("Tab content container.", [qa("tabs_content_container")], {
    cardinality: "zero-or-one",
    surface: "tabs",
  }),
  "slack.tabs.panel": selector("Tab panel.", [slackClass(".c-tabs__tab_panel"), slackClass(".p-about_modal__tab_panel")], {
    surface: "tabs",
  }),
  "slack.tabs.tab": selector("Tab control.", [slackClass(".c-tabs__tab")], {
    surface: "tabs",
  }),
  "slack.tabs.tab-active": selector("Active tab control.", [slackClass(".c-tabs__tab--active")], {
    cardinality: "zero-or-one",
    surface: "tabs",
  }),
  "slack.field.root": selector("Form field.", [slackClass(".p-field")], {
    surface: "forms",
  }),
  "slack.field.group": selector("Form field group.", [slackClass(".p-field_group")], {
    surface: "forms",
  }),
  "slack.field.title": selector("Form field title.", [slackClass(".p-field__title")], {
    surface: "forms",
  }),
  "slack.field.description": selector("Form field description.", [slackClass(".p-field__description")], {
    surface: "forms",
  }),
  "slack.control.text-input": selector("Slack text input.", [slackClass(".c-input_text")], {
    surface: "controls",
  }),
  "slack.control.select-button": selector("Slack select control.", [slackClass(".c-select_button")], {
    surface: "controls",
  }),
  "slack.control.checkbox": selector("Slack checkbox.", [slackClass(".c-input_checkbox")], {
    surface: "controls",
  }),
  "slack.control.outline-button": selector("Slack outline button.", [slackClass(".c-button--outline")], {
    surface: "controls",
  }),
  "slack.keyboard.key": selector(
    "Keyboard shortcut key.",
    [slackClass(".c-keyboard_key"), generated('[class*="keyboardKey__"]')],
    { surface: "controls" },
  ),
  "slack.menu.root": selector("Slack menu.", [aria('[role="menu"]'), slackClass(".c-menu")], {
    surface: "menu",
  }),
  "slack.menu.items": selector("Slack menu item collection.", [slackClass(".c-menu__items")], {
    cardinality: "zero-or-one",
    surface: "menu",
  }),
  "slack.menu.item": selector(
    "Slack menu item.",
    [aria('[role="menuitem"]'), slackClass(".c-menu_item__button"), slackClass(".c-menu_item__li")],
    { surface: "menu" },
  ),
  "slack.menu.separator": selector("Slack menu separator.", [slackClass(".c-menu_separator")], {
    surface: "menu",
  }),
  "slack.autocomplete.root": selector("Composer autocomplete popover.", [slackClass(".c-texty_autocomplete")], {
    cardinality: "zero-or-one",
    surface: "autocomplete",
  }),
  "slack.autocomplete.body": selector("Composer autocomplete body.", [slackClass(".c-texty_autocomplete__body")], {
    cardinality: "zero-or-one",
    surface: "autocomplete",
  }),
  "slack.autocomplete.results": selector("Composer autocomplete results.", [slackClass(".c-texty_autocomplete__results")], {
    cardinality: "zero-or-one",
    surface: "autocomplete",
  }),
  "slack.autocomplete.result": selector("Composer autocomplete result.", [slackClass(".c-texty_autocomplete__result")], {
    surface: "autocomplete",
  }),
  "slack.autocomplete.result-selected": selector("Selected composer autocomplete result.", [slackClass(".c-texty_autocomplete__result--pseudo-selected")], {
    cardinality: "zero-or-one",
    surface: "autocomplete",
  }),
  "slack.autocomplete.member-name": selector(
    "Autocomplete member name.",
    [qa("member_name"), slackClass(".c-member__member-name")],
    { surface: "autocomplete" },
  ),
  "slack.autocomplete.secondary-name": selector("Autocomplete secondary name.", [slackClass(".c-member__secondary-name")], {
    surface: "autocomplete",
  }),
  "slack.autocomplete.current-status": selector("Autocomplete member status.", [slackClass(".c-member__current-status")], {
    surface: "autocomplete",
  }),
  "slack.emoji-picker.root": selector("Emoji picker.", [slackClass(".p-emoji_picker")], {
    cardinality: "zero-or-one",
    surface: "emoji-picker",
  }),
  "slack.emoji-picker.content": selector("Emoji picker content.", [slackClass(".p-emoji_picker__content")], {
    cardinality: "zero-or-one",
    surface: "emoji-picker",
  }),
  "slack.emoji-picker.footer": selector("Emoji picker footer.", [slackClass(".p-emoji_picker__footer")], {
    cardinality: "zero-or-one",
    surface: "emoji-picker",
  }),

  "klack.plugin-manager.trigger": selector("Plugin manager top-nav trigger.", [klack("[data-klack-plugin-manager-trigger]")], {
    cardinality: "zero-or-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.overlay": selector("Plugin manager backdrop.", [klack("[data-klack-plugin-manager-overlay]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.dialog": selector("Plugin manager dialog.", [klack("[data-klack-plugin-manager-dialog]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.header": selector("Plugin manager header.", [klack("[data-klack-plugin-manager-header]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.heading": selector("Plugin manager heading.", [klack("[data-klack-plugin-manager-heading]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.subtitle": selector("Plugin manager subtitle.", [klack("[data-klack-plugin-manager-subtitle]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.close": selector("Plugin manager close action.", [klack("[data-klack-plugin-manager-close]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.tabs": selector("Plugin manager Plugins/Themes tabs.", [klack("[data-klack-plugin-manager-tabs]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.tab": selector("Plugin manager tab.", [klack("[data-klack-plugin-manager-tab]")], {
    cardinality: "one-or-more",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.toolbar": selector("Plugin manager toolbar.", [klack("[data-klack-plugin-manager-toolbar]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.search-wrap": selector("Plugin manager search wrapper.", [klack("[data-klack-plugin-manager-search-wrap]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.search": selector("Plugin manager search input.", [klack("[data-klack-plugin-manager-search]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.list": selector("Plugin manager list.", [klack("[data-klack-plugin-manager-list]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.row": selector("Plugin manager list row.", [klack("[data-klack-plugin-manager-row]")], {
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.icon": selector("Plugin manager item icon.", [klack("[data-klack-plugin-manager-icon]")], {
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.copy": selector("Plugin manager item copy.", [klack("[data-klack-plugin-manager-copy]")], {
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.name-line": selector("Plugin manager item name row.", [klack("[data-klack-plugin-manager-name-line]")], {
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.name": selector("Plugin manager item name.", [klack("[data-klack-plugin-manager-name]")], {
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.status": selector("Plugin manager item status.", [klack("[data-klack-plugin-manager-status]")], {
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.description": selector("Plugin manager item description.", [klack("[data-klack-plugin-manager-description]")], {
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.switch": selector("Plugin manager item switch.", [klack("[data-klack-plugin-manager-switch]")], {
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.empty": selector("Plugin manager empty state.", [klack("[data-klack-plugin-manager-empty]")], {
    cardinality: "zero-or-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.footer": selector("Plugin manager footer.", [klack("[data-klack-plugin-manager-footer]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.path": selector("Plugin manager source path.", [klack("[data-klack-plugin-manager-path]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),
  "klack.plugin-manager.done": selector("Plugin manager done action.", [klack("[data-klack-plugin-manager-done]")], {
    cardinality: "exactly-one",
    surface: "plugin-manager",
  }),

  "klack.tabbed-slack.strip": selector("TabbedSlack tab strip.", [klack("[data-tabbed-slack-strip]")], {
    cardinality: "zero-or-one",
    surface: "tabbed-slack",
  }),
  "klack.tabbed-slack.tab": selector("TabbedSlack tab.", [klack("[data-tabbed-slack-tab]")], {
    surface: "tabbed-slack",
  }),
  "klack.tabbed-slack.tab-link": selector("TabbedSlack tab link.", [klack("[data-tabbed-slack-tab-link]")], {
    surface: "tabbed-slack",
  }),
  "klack.tabbed-slack.close": selector("TabbedSlack tab close action.", [klack("[data-tabbed-slack-close]")], {
    surface: "tabbed-slack",
  }),

  "klack.message.decorated": selector("Message annotated by Klack's compatibility plugin.", [klack("[data-klack-message]")], {
    surface: "message",
  }),
  "klack.message.content": selector("Message content annotated by Klack.", [klack("[data-klack-message-content]")], {
    surface: "message",
  }),
  "klack.message.prefix": selector("Minimal message prefix contributed by Klack.", [klack("[data-klack-message-prefix]")], {
    surface: "message",
  }),
  "klack.message.time": selector("Minimal message time label contributed by Klack.", [klack("[data-klack-message-time]")], {
    surface: "message",
  }),
  "klack.message.sender": selector("Minimal message sender label contributed by Klack.", [klack("[data-klack-message-sender]")], {
    surface: "message",
  }),
} as const satisfies Record<string, ThemeSelectorDefinition>;

export type ThemeSelectorId = keyof typeof THEME_SELECTORS;

export function selectorFor(id: ThemeSelectorId): string {
  const candidates = THEME_SELECTORS[id].candidates.map(({ selector }) => selector);
  return candidates.length === 1 ? candidates[0] : `:is(${candidates.join(", ")})`;
}

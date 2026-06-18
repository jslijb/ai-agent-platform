export default defineAppConfig({
  pages: [
    "pages/chat/index",
    "pages/search/index",
    "pages/conversations/index",
    "pages/documents/index",
    "pages/profile/index",
  ],
  window: {
    backgroundTextStyle: "light",
    navigationBarBackgroundColor: "#1a1a2e",
    navigationBarTitleText: "AI金融助手",
    navigationBarTextStyle: "white",
  },
  tabBar: {
    color: "#999999",
    selectedColor: "#4a90d9",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: [
      {
        pagePath: "pages/chat/index",
        text: "聊天",
        iconPath: "assets/tab-chat.png",
        selectedIconPath: "assets/tab-chat-active.png",
      },
      {
        pagePath: "pages/search/index",
        text: "检索",
        iconPath: "assets/tab-search.png",
        selectedIconPath: "assets/tab-search-active.png",
      },
      {
        pagePath: "pages/profile/index",
        text: "我的",
        iconPath: "assets/tab-profile.png",
        selectedIconPath: "assets/tab-profile-active.png",
      },
    ],
  },
});

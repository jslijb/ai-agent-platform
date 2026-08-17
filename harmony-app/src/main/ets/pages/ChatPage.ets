@Entry
@Component
struct ChatPage {
  @State messages: Array<{ role: string; content: string }> = []
  @State inputValue: string = ''
  @State loading: boolean = false
  @State chatMode: string = 'rag'
  private scroller: Scroller = new Scroller()

  build() {
    Column() {
      Row() {
        Button(this.chatMode === 'rag' ? 'RAG问答' : 'Agent对话')
          .fontSize(14)
          .backgroundColor(this.chatMode === 'rag' ? '#4a90d9' : '#e67e22')
          .fontColor(Color.White)
          .borderRadius(16)
          .padding({ left: 12, right: 12, top: 6, bottom: 6 })
          .onClick(() => {
            this.chatMode = this.chatMode === 'rag' ? 'agent' : 'rag'
          })
      }
      .width('100%')
      .justifyContent(FlexAlign.Center)
      .padding(8)
      .backgroundColor(Color.White)

      List({ space: 12, scroller: this.scroller }) {
        ForEach(this.messages, (msg: { role: string; content: string }, index: number) => {
          ListItem() {
            Row() {
              if (msg.role === 'assistant') {
                Text('AI')
                  .width(36)
                  .height(36)
                  .borderRadius(18)
                  .textAlign(TextAlign.Center)
                  .fontSize(14)
                  .fontColor(Color.White)
                  .backgroundColor('#4a90d9')
                  .margin({ right: 8 })
              }
              Text(msg.content || (this.loading && msg.role === 'assistant' ? '思考中...' : ''))
                .fontSize(14)
                .padding(12)
                .borderRadius(12)
                .backgroundColor(msg.role === 'user' ? '#4a90d9' : Color.White)
                .fontColor(msg.role === 'user' ? Color.White : '#333333')
                .maxLines(100)
              if (msg.role === 'user') {
                Text('我')
                  .width(36)
                  .height(36)
                  .borderRadius(18)
                  .textAlign(TextAlign.Center)
                  .fontSize(14)
                  .fontColor(Color.White)
                  .backgroundColor('#67c23a')
                  .margin({ left: 8 })
              }
            }
            .width('100%')
            .justifyContent(msg.role === 'user' ? FlexAlign.End : FlexAlign.Start)
            .padding({ left: 16, right: 16 })
          }
        }, (msg: { role: string; content: string }, index: number) => `${index}`)

        if (this.messages.length === 0) {
          ListItem() {
            Column() {
              Text('💬')
                .fontSize(48)
                .margin({ bottom: 12 })
              Text(this.chatMode === 'rag' ? '向AI金融助手提问' : '与AI Agent对话')
                .fontSize(18)
                .fontColor('#333333')
                .fontWeight(FontWeight.Bold)
                .margin({ bottom: 8 })
              Text(this.chatMode === 'rag' ? '例如：格力电器2025年营收是多少？' : '例如：帮我提交一个请假申请')
                .fontSize(12)
                .fontColor('#999999')
            }
            .width('100%')
            .height('100%')
            .justifyContent(FlexAlign.Center)
            .alignItems(HorizontalAlign.Center)
          }
        }
      }
      .layoutWeight(1)
      .padding({ top: 8, bottom: 8 })

      Row() {
        TextInput({ placeholder: this.chatMode === 'rag' ? '输入您的问题...' : '告诉Agent您需要什么...' })
          .layoutWeight(1)
          .height(40)
          .borderRadius(20)
          .backgroundColor('#f5f5f5')
          .padding({ left: 16, right: 16 })
          .fontSize(14)
          .onChange((value: string) => {
            this.inputValue = value
          })
          .enabled(!this.loading)

        Button('发送')
          .height(40)
          .borderRadius(20)
          .backgroundColor(this.inputValue.trim() && !this.loading ? '#4a90d9' : '#cccccc')
          .fontColor(Color.White)
          .fontSize(14)
          .margin({ left: 8 })
          .padding({ left: 16, right: 16 })
          .enabled(!!this.inputValue.trim() && !this.loading)
          .onClick(() => {
            this.handleSend()
          })
      }
      .width('100%')
      .padding({ left: 16, right: 16, top: 8, bottom: 8 })
      .backgroundColor(Color.White)
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#f5f5f5')
  }

  handleSend() {
    const query = this.inputValue.trim()
    if (!query || this.loading) return

    this.messages.push({ role: 'user', content: query })
    this.inputValue = ''
    this.loading = true

    this.messages.push({ role: 'assistant', content: '' })

    const endpoint = this.chatMode === 'agent' ? '/api/v2/agent' : '/api/v2/chat'
    const baseUrl = 'http://localhost'

    http.request(`${baseUrl}${endpoint}`, {
      method: http.RequestMethod.POST,
      header: { 'Content-Type': 'application/json' },
      extraData: JSON.stringify({ query }),
    }, (err: Error, data: http.Response) => {
      this.loading = false
      if (!err && data.responseCode === 200) {
        try {
          const result = JSON.parse(data.result as string)
          this.messages[this.messages.length - 1] = {
            role: 'assistant',
            content: result.answer || result.content || '抱歉，无法生成回答',
          }
        } catch {
          this.messages[this.messages.length - 1] = {
            role: 'assistant',
            content: '抱歉，无法生成回答',
          }
        }
      } else {
        this.messages[this.messages.length - 1] = {
          role: 'assistant',
          content: '请求失败，请重试',
        }
      }
    })
  }
}

import http from '@ohos.net.http'
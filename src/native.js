import { Capacitor, registerPlugin } from '@capacitor/core';
const inbox = registerPlugin('LeafInbox');
export function setupInbox(importBook, report) {
  if (!Capacitor.isNativePlatform()) return;
  let handling=false;
  const consume=async()=>{
    if(handling)return;handling=true;
    try {
      for(let i=0;i<8;i++){
        const item=await inbox.take();if(!item.url)break;
        try{
          const response=await fetch(Capacitor.convertFileSrc(item.url));
          if(!response.ok)throw new Error('Не удалось получить переданную книгу.');
          await importBook(new File([await response.blob()],item.name));
        }catch(e){report(e);}
        await inbox.ack({id:item.id});
      }
    }catch(e){report(e);}finally{handling=false;}
  };
  window.addEventListener('leaf-inbox',consume);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void consume();});
  void consume();
}

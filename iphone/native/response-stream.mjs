// Consume complete SSE events, including split UTF-8 characters and CRLF.
// Only completed tool arguments may execute. A delta is never executable.
export async function readResponse(response, {onItem=async()=>{},signal}={}) {
  if (!response.ok) {
    const data=await response.json().catch(()=>({}));
    throw Error(String(data.error?.message||`Model returned ${response.status}`).replace(/sk-[A-Za-z0-9_.*-]+/g,'[redacted key]'));
  }
  let buffer='', completed=null;
  const decoder=new TextDecoder(), seen=new Set();
  const dispatch=async block=>{
    const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
    if(!data||data==='[DONE]')return;
    const event=JSON.parse(data);
    signal?.throwIfAborted();
    if(event.type==='response.output_item.done'&&event.item) {
      const key=event.item.id||event.item.call_id;
      if(!seen.has(key)){seen.add(key);await onItem(event.item);}
    }
    if(event.type==='response.completed')completed=event.response;
    if(['error','response.failed','response.incomplete'].includes(event.type))throw Error(event.response?.error?.message||event.error?.message||event.message||'Astra response did not complete. Completed edits are kept.');
  };
  const reader=response.body.getReader();
  try {
    while(!completed) {
      const {done,value}=await reader.read();
      if(done)break;
      buffer=(buffer+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');
      let end;while(!completed&&(end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);await dispatch(block);}
    }
    if(!completed){buffer+=decoder.decode();if(buffer.trim())await dispatch(buffer);}
  } finally {
    // Async iteration awaits cancel() when breaking. Some HTTP transports take
    // tens of seconds to finish cancellation after response.completed.
    // The complete response is already ours; cleanup must not block the work.
    void reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
  if(!completed)throw Error('Astra connection ended before completion. Completed edits are kept.');
  return completed;
}

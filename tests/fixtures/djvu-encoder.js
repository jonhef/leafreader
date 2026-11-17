import IWImageWriter from '../../vendor/djvu/src/iw44/IWImageWriter.js';
import ByteStreamWriter from '../../vendor/djvu/src/ByteStreamWriter.js';
export function generate() {
  const width=160,height=240;
  const images=[0,1].map(page=>{
    const data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4;
      const ink=x>20&&x<140&&y>25&&y<210&&(y%18<5);
      data[i]=ink?(page?130:30):245;data[i+1]=ink?70:242;data[i+2]=ink?70:230;data[i+3]=255;
    }
    return {width,height,data};
  });
  const encoder=new IWImageWriter(60,0,1);
  encoder.startMultiPageDocument();images.forEach(image=>encoder.addPageToDocument(image));
  const multi=encoder.endMultiPageDocument();
  const writer=new ByteStreamWriter();writer.writeStr('AT&T');encoder.writeImagePage(writer,images[0]);
  return {multi,single:writer.getBuffer()};
}

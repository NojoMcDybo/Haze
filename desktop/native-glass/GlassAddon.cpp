#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <d3d11.h>
#include <d3dcompiler.h>
#include <dxgi1_6.h>
#include <dcomp.h>
#include <wrl/client.h>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <mutex>
#include <new>
#include <vector>

using Microsoft::WRL::ComPtr;

// Minimal, ABI-stable Node-API declarations. The functions are resolved from
// the host executable, so the addon needs neither Node headers nor node.lib.
struct napi_env__;
struct napi_value__;
struct napi_callback_info__;
using napi_env = napi_env__*;
using napi_value = napi_value__*;
using napi_callback_info = napi_callback_info__*;
using napi_status = int32_t;
using napi_callback = napi_value(__cdecl*)(napi_env, napi_callback_info);
enum napi_valuetype { napi_undefined, napi_null, napi_boolean, napi_number, napi_string, napi_symbol, napi_object, napi_function, napi_external, napi_bigint };
enum napi_property_attributes { napi_default = 0 };
struct napi_property_descriptor {
  const char* utf8name; napi_value name; napi_callback method; napi_callback getter;
  napi_callback setter; napi_value value; napi_property_attributes attributes; void* data;
};

struct NapiApi {
  napi_status(__cdecl* get_cb_info)(napi_env,napi_callback_info,size_t*,napi_value*,napi_value*,void**)=nullptr;
  napi_status(__cdecl* get_buffer_info)(napi_env,napi_value,void**,size_t*)=nullptr;
  napi_status(__cdecl* get_value_double)(napi_env,napi_value,double*)=nullptr;
  napi_status(__cdecl* is_array)(napi_env,napi_value,bool*)=nullptr;
  napi_status(__cdecl* get_array_length)(napi_env,napi_value,uint32_t*)=nullptr;
  napi_status(__cdecl* get_element)(napi_env,napi_value,uint32_t,napi_value*)=nullptr;
  napi_status(__cdecl* typeof_value)(napi_env,napi_value,napi_valuetype*)=nullptr;
  napi_status(__cdecl* create_int32)(napi_env,int32_t,napi_value*)=nullptr;
  napi_status(__cdecl* create_double)(napi_env,double,napi_value*)=nullptr;
  napi_status(__cdecl* create_object)(napi_env,napi_value*)=nullptr;
  napi_status(__cdecl* set_named_property)(napi_env,napi_value,const char*,napi_value)=nullptr;
  napi_status(__cdecl* get_undefined)(napi_env,napi_value*)=nullptr;
  napi_status(__cdecl* define_properties)(napi_env,napi_value,size_t,const napi_property_descriptor*)=nullptr;
  napi_status(__cdecl* add_env_cleanup_hook)(napi_env,void(__cdecl*)(void*),void*)=nullptr;
};
static NapiApi napi;

template<class T> static bool Resolve(T& target,const char* name){
  target=reinterpret_cast<T>(GetProcAddress(GetModuleHandleW(nullptr),name));return target!=nullptr;
}
static bool ResolveNapi(){
  return Resolve(napi.get_cb_info,"napi_get_cb_info")&&Resolve(napi.get_buffer_info,"napi_get_buffer_info")&&
    Resolve(napi.get_value_double,"napi_get_value_double")&&Resolve(napi.is_array,"napi_is_array")&&
    Resolve(napi.get_array_length,"napi_get_array_length")&&Resolve(napi.get_element,"napi_get_element")&&
    Resolve(napi.typeof_value,"napi_typeof")&&Resolve(napi.create_int32,"napi_create_int32")&&
    Resolve(napi.create_double,"napi_create_double")&&Resolve(napi.create_object,"napi_create_object")&&
    Resolve(napi.set_named_property,"napi_set_named_property")&&Resolve(napi.get_undefined,"napi_get_undefined")&&
    Resolve(napi.define_properties,"napi_define_properties")&&Resolve(napi.add_env_cleanup_hook,"napi_add_env_cleanup_hook");
}

static constexpr DWORD WDA_EXCLUDEFROMCAPTURE_VALUE=0x11;
static constexpr int MAX_PANEL_DIMENSION=2048;
static constexpr size_t MAX_PANEL_PIXELS=4u*1024u*1024u;
static constexpr uint32_t MAX_POLYGON_COORDINATES=4096;
static constexpr int SUPERSAMPLE=4;

static const char* shader=R"SHADER(
cbuffer Params : register(b0) {
 float2 sourceSize; float2 panelOffset;
 float2 panelSize; float sigma; float axis; float strength; float padding;
};
Texture2D scene : register(t0);
Texture2D normals : register(t1);
SamplerState linearClamp : register(s0);
float4 VS(uint i:SV_VertexID):SV_Position {
 float2 uv=float2((i<<1)&2,i&2);return float4(uv*float2(2,-2)+float2(-1,1),0,1);
}
float2 safeUV(float2 p){return clamp(p,float2(.5,.5),sourceSize-.5)/sourceSize;}
float4 Blur(float4 pos:SV_Position):SV_Target {
 float2 direction=axis<.5?float2(1,0):float2(0,1);
 float3 color=0;float sum=0;
 [unroll]for(int i=-8;i<=8;i++){
   float t=i/8.0;float weight=exp(-4.5*t*t);
   color+=scene.SampleLevel(linearClamp,safeUV(pos.xy+direction*(t*sigma*3)),0).rgb*weight;sum+=weight;
 }
 return float4(color/sum,1);
}
float4 Lens(float4 pos:SV_Position):SV_Target {
 float4 field=normals.Load(int3(int2(pos.xy),0));
 float coverage=saturate(field.a);
 if(coverage<=0)return float4(0,0,0,0);
 float depth=field.b;
 float t=saturate(depth/14.0);
 float bend=depth<14?7.0*pow(sin(t*3.14159265),2):0;
 float2 shift=field.rg*bend;
 float2 base=panelOffset+pos.xy;
 float3 rgb;
 rgb.r=scene.SampleLevel(linearClamp,safeUV(base+shift*1.16),0).r;
 rgb.g=scene.SampleLevel(linearClamp,safeUV(base+shift),0).g;
 rgb.b=scene.SampleLevel(linearClamp,safeUV(base+shift*.84),0).b;
 return float4(saturate(rgb)*coverage*strength,coverage*strength);
}
)SHADER";

struct Params {float sourceW,sourceH,offsetX,offsetY,panelW,panelH,sigma,axis,strength,padding;};
struct Texture {ComPtr<ID3D11Texture2D> tex;ComPtr<ID3D11ShaderResourceView> srv;ComPtr<ID3D11RenderTargetView> rtv;};
struct PointF {float x,y;};
struct Glass;
static LRESULT CALLBACK GlassProc(HWND,UINT,WPARAM,LPARAM);

static HRESULT RasterizePolygon(int w,int h,const std::vector<PointF>& points,std::vector<unsigned char>& alpha){
  if(w<1||h<1||points.size()<3||points.size()>MAX_POLYGON_COORDINATES/2)return E_INVALIDARG;
  const size_t area=(size_t)w*(size_t)h;
  if(area>MAX_PANEL_PIXELS)return E_INVALIDARG;
  std::vector<unsigned char> coverage(area,0);
  std::vector<float> intersections;intersections.reserve(points.size());
  const int subWidth=w*SUPERSAMPLE;
  for(int subY=0;subY<h*SUPERSAMPLE;subY++){
    const float sampleY=(subY+.5f)/SUPERSAMPLE;intersections.clear();
    for(size_t i=0,j=points.size()-1;i<points.size();j=i++){
      const PointF& a=points[j];const PointF& b=points[i];
      if((a.y<=sampleY&&b.y>sampleY)||(b.y<=sampleY&&a.y>sampleY))
        intersections.push_back(a.x+(sampleY-a.y)*(b.x-a.x)/(b.y-a.y));
    }
    std::sort(intersections.begin(),intersections.end());
    for(size_t i=0;i+1<intersections.size();i+=2){
      int first=(int)std::ceil(intersections[i]*SUPERSAMPLE-.5f);
      int after=(int)std::ceil(intersections[i+1]*SUPERSAMPLE-.5f);
      first=std::clamp(first,0,subWidth);after=std::clamp(after,0,subWidth);
      const size_t row=(size_t)(subY/SUPERSAMPLE)*(size_t)w;
      for(int subX=first;subX<after;subX++)coverage[row+(size_t)(subX/SUPERSAMPLE)]++;
    }
  }
  alpha.resize(area);size_t visible=0;
  for(size_t i=0;i<area;i++){alpha[i]=(unsigned char)((coverage[i]*255+8)/(SUPERSAMPLE*SUPERSAMPLE));if(alpha[i])visible++;}
  return visible?S_OK:E_INVALIDARG;
}

struct Glass {
  HWND owner=nullptr,window=nullptr;DWORD threadId=0;HMONITOR monitor=nullptr;RECT screen{},bounds{},crop{};
  ComPtr<ID3D11Device> device;ComPtr<ID3D11DeviceContext> context;
  ComPtr<IDXGIOutput1> output;ComPtr<IDXGIOutputDuplication> capture;
  ComPtr<IDXGISwapChain1> swap;ComPtr<IDCompositionDevice> composition;
  ComPtr<IDCompositionTarget> target;ComPtr<IDCompositionVisual> visual;ComPtr<IDCompositionVisual3> visual3;
  ComPtr<ID3D11VertexShader> vs;ComPtr<ID3D11PixelShader> blur,lens;
  ComPtr<ID3D11SamplerState> sampler;ComPtr<ID3D11Buffer> constants;
  Texture region,horizontal,vertical,mask;ComPtr<ID3D11Texture2D> desktopCache;std::vector<unsigned char> alpha;
  int width=0,height=0,cropWidth=0,cropHeight=0;float sigma=3,opacity=1;
  bool dirty=true,hasFrame=false,shown=false,restoreAffinity=false;ULONGLONG retry=0;
  HRESULT lastError=S_OK;uint64_t frames=0;DWORD previousAffinity=0;
  ~Glass(){
    if(context)context->ClearState();
    visual3.Reset();visual.Reset();target.Reset();composition.Reset();swap.Reset();capture.Reset();desktopCache.Reset();
    if(window){DestroyWindow(window);window=nullptr;}
    if(owner&&restoreAffinity)SetWindowDisplayAffinity(owner,previousAffinity);
  }
  bool OnOwnerThread()const{return GetCurrentThreadId()==threadId;}
  HRESULT Compile(const char* entry,const char* profile,ID3DBlob** out){
    ComPtr<ID3DBlob> errors;return D3DCompile(shader,strlen(shader),nullptr,nullptr,nullptr,entry,profile,D3DCOMPILE_OPTIMIZATION_LEVEL3,0,out,&errors);
  }
  HRESULT MakeTexture(Texture& t,int w,int h,DXGI_FORMAT format,bool render,const void* data=nullptr,int pitch=0){
    t={};D3D11_TEXTURE2D_DESC d{};d.Width=w;d.Height=h;d.MipLevels=d.ArraySize=1;d.Format=format;d.SampleDesc.Count=1;
    d.Usage=D3D11_USAGE_DEFAULT;d.BindFlags=D3D11_BIND_SHADER_RESOURCE|(render?D3D11_BIND_RENDER_TARGET:0);
    D3D11_SUBRESOURCE_DATA init{data,(UINT)pitch,0};HRESULT hr=device->CreateTexture2D(&d,data?&init:nullptr,&t.tex);
    if(FAILED(hr))return hr;hr=device->CreateShaderResourceView(t.tex.Get(),nullptr,&t.srv);
    if(SUCCEEDED(hr)&&render)hr=device->CreateRenderTargetView(t.tex.Get(),nullptr,&t.rtv);return hr;
  }
  HRESULT Initialize(HWND anchor){
    owner=anchor;if(!IsWindow(owner))return E_HANDLE;
    DWORD pid=0;threadId=GetWindowThreadProcessId(owner,&pid);
    if(pid!=GetCurrentProcessId())return E_ACCESSDENIED;
    if(threadId!=GetCurrentThreadId())return RPC_E_WRONG_THREAD;
    if(GetWindowDisplayAffinity(owner,&previousAffinity))restoreAffinity=true;
    else return HRESULT_FROM_WIN32(GetLastError());
    monitor=MonitorFromWindow(owner,MONITOR_DEFAULTTONEAREST);
    ComPtr<IDXGIFactory1> factory;HRESULT hr=CreateDXGIFactory1(IID_PPV_ARGS(&factory));if(FAILED(hr))return hr;
    ComPtr<IDXGIAdapter1> selected;
    for(UINT i=0;;i++){
      ComPtr<IDXGIAdapter1> adapter;HRESULT enumHr=factory->EnumAdapters1(i,&adapter);if(enumHr==DXGI_ERROR_NOT_FOUND)break;if(FAILED(enumHr))return enumHr;
      for(UINT j=0;;j++){
        ComPtr<IDXGIOutput> candidate;enumHr=adapter->EnumOutputs(j,&candidate);if(enumHr==DXGI_ERROR_NOT_FOUND)break;if(FAILED(enumHr))return enumHr;
        DXGI_OUTPUT_DESC d{};hr=candidate->GetDesc(&d);if(FAILED(hr))return hr;
        if(d.Monitor==monitor){
          if(d.Rotation!=DXGI_MODE_ROTATION_IDENTITY)return E_NOTIMPL;
          ComPtr<IDXGIOutput6> output6;if(SUCCEEDED(candidate.As(&output6))){
            DXGI_OUTPUT_DESC1 d1{};hr=output6->GetDesc1(&d1);if(FAILED(hr))return hr;if(d1.ColorSpace!=DXGI_COLOR_SPACE_RGB_FULL_G22_NONE_P709)return DXGI_ERROR_UNSUPPORTED;
          }
          hr=candidate.As(&output);if(FAILED(hr))return hr;selected=adapter;screen=d.DesktopCoordinates;break;
        }
      }
      if(selected)break;
    }
    if(!selected||!output)return DXGI_ERROR_NOT_FOUND;
    hr=D3D11CreateDevice(selected.Get(),D3D_DRIVER_TYPE_UNKNOWN,nullptr,D3D11_CREATE_DEVICE_BGRA_SUPPORT,nullptr,0,D3D11_SDK_VERSION,&device,nullptr,&context);if(FAILED(hr))return hr;
    ComPtr<ID3DBlob> blob;hr=Compile("VS","vs_5_0",&blob);if(FAILED(hr))return hr;hr=device->CreateVertexShader(blob->GetBufferPointer(),blob->GetBufferSize(),nullptr,&vs);if(FAILED(hr))return hr;
    blob.Reset();hr=Compile("Blur","ps_5_0",&blob);if(FAILED(hr))return hr;hr=device->CreatePixelShader(blob->GetBufferPointer(),blob->GetBufferSize(),nullptr,&blur);if(FAILED(hr))return hr;
    blob.Reset();hr=Compile("Lens","ps_5_0",&blob);if(FAILED(hr))return hr;hr=device->CreatePixelShader(blob->GetBufferPointer(),blob->GetBufferSize(),nullptr,&lens);if(FAILED(hr))return hr;
    D3D11_BUFFER_DESC bd{};bd.ByteWidth=sizeof(Params);bd.Usage=D3D11_USAGE_DEFAULT;bd.BindFlags=D3D11_BIND_CONSTANT_BUFFER;hr=device->CreateBuffer(&bd,nullptr,&constants);if(FAILED(hr))return hr;
    D3D11_SAMPLER_DESC sd{};sd.Filter=D3D11_FILTER_MIN_MAG_MIP_LINEAR;sd.AddressU=sd.AddressV=sd.AddressW=D3D11_TEXTURE_ADDRESS_CLAMP;sd.MaxLOD=D3D11_FLOAT32_MAX;hr=device->CreateSamplerState(&sd,&sampler);if(FAILED(hr))return hr;
    WNDCLASSW wc{};wc.lpfnWndProc=GlassProc;wc.hInstance=GetModuleHandleW(nullptr);wc.lpszClassName=L"Nebel.Native.ColorlessGlass";
    if(!RegisterClassW(&wc)&&GetLastError()!=ERROR_CLASS_ALREADY_EXISTS)return HRESULT_FROM_WIN32(GetLastError());
    window=CreateWindowExW(WS_EX_NOREDIRECTIONBITMAP|WS_EX_NOACTIVATE|WS_EX_TOOLWINDOW|WS_EX_TRANSPARENT,wc.lpszClassName,L"Nebel colorless glass",WS_POPUP,0,0,1,1,nullptr,nullptr,wc.hInstance,this);
    if(!window)return HRESULT_FROM_WIN32(GetLastError());
    if(!SetWindowDisplayAffinity(owner,WDA_EXCLUDEFROMCAPTURE_VALUE))return HRESULT_FROM_WIN32(GetLastError());
    if(!SetWindowDisplayAffinity(window,WDA_EXCLUDEFROMCAPTURE_VALUE))return HRESULT_FROM_WIN32(GetLastError());
    ComPtr<IDXGIDevice> dxgi;hr=device.As(&dxgi);if(FAILED(hr))return hr;hr=DCompositionCreateDevice(dxgi.Get(),IID_PPV_ARGS(&composition));if(FAILED(hr))return hr;
    hr=composition->CreateTargetForHwnd(window,TRUE,&target);if(FAILED(hr))return hr;
    hr=composition->CreateVisual(&visual);if(FAILED(hr))return hr;
    // IDCompositionVisual3 is optional on older Windows/DComp implementations;
    // opacity is also applied in the premultiplied shader below.
    visual.As(&visual3);
    hr=target->SetRoot(visual.Get());if(FAILED(hr))return hr;
    return composition->Commit();
  }
  HRESULT ConfigureMask(int x,int y,int w,int h,const std::vector<unsigned char>& nextAlpha,float amount,float strength){
    if(!OnOwnerThread())return RPC_E_WRONG_THREAD;
    if(w<1||h<1||w>MAX_PANEL_DIMENSION||h>MAX_PANEL_DIMENSION||(size_t)w*(size_t)h>MAX_PANEL_PIXELS||nextAlpha.size()!=(size_t)w*(size_t)h)return E_INVALIDARG;
    if(x<-1000000||x>1000000||y<-1000000||y>1000000||x<std::numeric_limits<LONG>::min()+72||y<std::numeric_limits<LONG>::min()+72||x>std::numeric_limits<LONG>::max()-w-72||y>std::numeric_limits<LONG>::max()-h-72)return E_INVALIDARG;
    if(MonitorFromWindow(owner,MONITOR_DEFAULTTONEAREST)!=monitor)return DXGI_ERROR_ACCESS_LOST;
    context->ClearState();bool sizeChanged=w!=width||h!=height;
    bounds={x,y,x+w,y+h};sigma=std::clamp(amount,0.0f,18.0f);opacity=std::clamp(strength,0.0f,1.0f);
    RECT nextCrop{std::max<LONG>(screen.left,x-72),std::max<LONG>(screen.top,y-72),std::min<LONG>(screen.right,x+w+72),std::min<LONG>(screen.bottom,y+h+72)};
    int cw=nextCrop.right-nextCrop.left,ch=nextCrop.bottom-nextCrop.top;if(cw<1||ch<1)return E_INVALIDARG;
    if(memcmp(&crop,&nextCrop,sizeof(RECT))!=0)hasFrame=false;crop=nextCrop;
    HRESULT hr=S_OK;
    if(!swap){
      ComPtr<IDXGIDevice> dxgi;hr=device.As(&dxgi);if(FAILED(hr))return hr;ComPtr<IDXGIAdapter> adapter;hr=dxgi->GetAdapter(&adapter);if(FAILED(hr))return hr;ComPtr<IDXGIFactory2> factory;hr=adapter->GetParent(IID_PPV_ARGS(&factory));if(FAILED(hr))return hr;
      DXGI_SWAP_CHAIN_DESC1 d{};d.Width=w;d.Height=h;d.Format=DXGI_FORMAT_B8G8R8A8_UNORM;d.SampleDesc.Count=1;d.BufferUsage=DXGI_USAGE_RENDER_TARGET_OUTPUT;d.BufferCount=2;d.SwapEffect=DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL;d.AlphaMode=DXGI_ALPHA_MODE_PREMULTIPLIED;
      hr=factory->CreateSwapChainForComposition(device.Get(),&d,nullptr,&swap);if(FAILED(hr))return hr;
      hr=visual->SetContent(swap.Get());if(FAILED(hr))return hr;
    }else if(sizeChanged){hr=swap->ResizeBuffers(2,w,h,DXGI_FORMAT_B8G8R8A8_UNORM,0);if(FAILED(hr))return hr;}
    if(visual3){hr=visual3->SetOpacity(1.0f);if(FAILED(hr))return hr;}hr=composition->Commit();if(FAILED(hr))return hr;
    width=w;height=h;
    if(sizeChanged){
      for(int i=0;i<2;i++){ComPtr<ID3D11Texture2D> back;ComPtr<ID3D11RenderTargetView> rtv;hr=swap->GetBuffer(0,IID_PPV_ARGS(&back));if(FAILED(hr))return hr;hr=device->CreateRenderTargetView(back.Get(),nullptr,&rtv);if(FAILED(hr))return hr;float clear[4]={};context->ClearRenderTargetView(rtv.Get(),clear);hr=swap->Present(0,0);if(FAILED(hr))return hr;}
    }
    if(cw!=cropWidth||ch!=cropHeight){
      cropWidth=cw;cropHeight=ch;hasFrame=false;
      hr=MakeTexture(region,cw,ch,DXGI_FORMAT_B8G8R8A8_UNORM,false);if(FAILED(hr))return hr;
      hr=MakeTexture(horizontal,cw,ch,DXGI_FORMAT_B8G8R8A8_UNORM,true);if(FAILED(hr))return hr;
      hr=MakeTexture(vertical,cw,ch,DXGI_FORMAT_B8G8R8A8_UNORM,true);if(FAILED(hr))return hr;
    }
    alpha=nextAlpha;const size_t area=(size_t)w*(size_t)h;
    std::vector<float> distance(area),field(area*4);
    for(size_t i=0;i<area;i++)distance[i]=alpha[i]<128?0.0f:10000.0f;
    for(int yy=0;yy<h;yy++)for(int xx=0;xx<w;xx++){size_t i=(size_t)yy*w+xx;float& d=distance[i];if(xx)d=std::min(d,distance[i-1]+1);if(yy)d=std::min(d,distance[i-w]+1);if(xx&&yy)d=std::min(d,distance[i-w-1]+1.414214f);if(xx+1<w&&yy)d=std::min(d,distance[i-w+1]+1.414214f);}
    for(int yy=h-1;yy>=0;yy--)for(int xx=w-1;xx>=0;xx--){size_t i=(size_t)yy*w+xx;float& d=distance[i];if(xx+1<w)d=std::min(d,distance[i+1]+1);if(yy+1<h)d=std::min(d,distance[i+w]+1);if(xx+1<w&&yy+1<h)d=std::min(d,distance[i+w+1]+1.414214f);if(xx&&yy+1<h)d=std::min(d,distance[i+w-1]+1.414214f);}
    for(int yy=0;yy<h;yy++)for(int xx=0;xx<w;xx++){size_t i=(size_t)yy*w+xx;float gx=distance[(size_t)yy*w+std::min(w-1,xx+1)]-distance[(size_t)yy*w+std::max(0,xx-1)],gy=distance[(size_t)std::min(h-1,yy+1)*w+xx]-distance[(size_t)std::max(0,yy-1)*w+xx];float len=sqrtf(gx*gx+gy*gy);field[i*4]=len>.01f?-gx/len:0;field[i*4+1]=len>.01f?-gy/len:0;field[i*4+2]=distance[i];field[i*4+3]=alpha[i]/255.0f;}
    if(sizeChanged||!mask.tex){hr=MakeTexture(mask,w,h,DXGI_FORMAT_R32G32B32A32_FLOAT,false,field.data(),w*16);if(FAILED(hr))return hr;}
    else context->UpdateSubresource(mask.tex.Get(),0,nullptr,field.data(),w*16,0);
    std::vector<RECT> runs;
    for(int yy=0;yy<h;yy++){int xx=0;while(xx<w){while(xx<w&&!alpha[(size_t)yy*w+xx])xx++;int left=xx;while(xx<w&&alpha[(size_t)yy*w+xx])xx++;if(xx>left)runs.push_back(RECT{left,yy,xx,yy+1});}}
    HRGN outline=nullptr;
    if(runs.empty())outline=CreateRectRgn(0,0,0,0);
    else{
      if(runs.size()>(MAXDWORD-sizeof(RGNDATAHEADER))/sizeof(RECT))return E_OUTOFMEMORY;
      std::vector<unsigned char> data(sizeof(RGNDATAHEADER)+runs.size()*sizeof(RECT));auto rd=(RGNDATA*)data.data();
      rd->rdh.dwSize=sizeof(RGNDATAHEADER);rd->rdh.iType=RDH_RECTANGLES;rd->rdh.nCount=(DWORD)runs.size();rd->rdh.nRgnSize=(DWORD)(runs.size()*sizeof(RECT));rd->rdh.rcBound={0,0,w,h};memcpy(rd->Buffer,runs.data(),runs.size()*sizeof(RECT));
      outline=ExtCreateRegion(nullptr,(DWORD)data.size(),rd);
    }
    if(!outline)return HRESULT_FROM_WIN32(GetLastError());
    if(!SetWindowRgn(window,outline,FALSE)){DeleteObject(outline);return HRESULT_FROM_WIN32(GetLastError());}
    if(desktopCache)CopyCrop();
    if(!SetWindowPos(window,owner,x,y,w,h,SWP_NOACTIVATE))return HRESULT_FROM_WIN32(GetLastError());
    dirty=true;lastError=S_OK;return S_OK;
  }
  void CopyCrop(){
    D3D11_BOX box{(UINT)(crop.left-screen.left),(UINT)(crop.top-screen.top),0,(UINT)(crop.right-screen.left),(UINT)(crop.bottom-screen.top),1};
    context->CopySubresourceRegion(region.tex.Get(),0,0,0,0,desktopCache.Get(),0,&box);hasFrame=true;
  }
  void Pass(ID3D11RenderTargetView* rtv,ID3D11ShaderResourceView* source,ID3D11PixelShader* ps,int w,int h,Params params){
    context->UpdateSubresource(constants.Get(),0,nullptr,&params,0,0);context->IASetPrimitiveTopology(D3D11_PRIMITIVE_TOPOLOGY_TRIANGLELIST);context->VSSetShader(vs.Get(),nullptr,0);context->PSSetShader(ps,nullptr,0);
    ID3D11Buffer* cb=constants.Get();context->PSSetConstantBuffers(0,1,&cb);ID3D11SamplerState* smp=sampler.Get();context->PSSetSamplers(0,1,&smp);ID3D11ShaderResourceView* resources[2]={source,mask.srv.Get()};context->PSSetShaderResources(0,2,resources);context->OMSetRenderTargets(1,&rtv,nullptr);
    D3D11_VIEWPORT vp{0,0,(float)w,(float)h,0,1};context->RSSetViewports(1,&vp);context->Draw(3,0);ID3D11ShaderResourceView* empty[2]={};context->PSSetShaderResources(0,2,empty);context->OMSetRenderTargets(0,nullptr,nullptr);
  }
  HRESULT Draw(){
    Params p{(float)cropWidth,(float)cropHeight,(float)(bounds.left-crop.left),(float)(bounds.top-crop.top),(float)width,(float)height,sigma,0,opacity,0};ID3D11ShaderResourceView* source=region.srv.Get();
    if(sigma>.01f){Pass(horizontal.rtv.Get(),source,blur.Get(),cropWidth,cropHeight,p);p.axis=1;Pass(vertical.rtv.Get(),horizontal.srv.Get(),blur.Get(),cropWidth,cropHeight,p);source=vertical.srv.Get();}
    ComPtr<ID3D11Texture2D> back;ComPtr<ID3D11RenderTargetView> rtv;HRESULT hr=swap->GetBuffer(0,IID_PPV_ARGS(&back));if(FAILED(hr))return hr;hr=device->CreateRenderTargetView(back.Get(),nullptr,&rtv);if(FAILED(hr))return hr;Pass(rtv.Get(),source,lens.Get(),width,height,p);hr=swap->Present(0,0);
    if(SUCCEEDED(hr)){if(!shown){ShowWindow(window,SW_SHOWNOACTIVATE);shown=true;}SetWindowPos(window,owner,bounds.left,bounds.top,width,height,SWP_NOACTIVATE);frames++;}return hr;
  }
  void LoseCapture(HRESULT hr,ULONGLONG delay){
    lastError=hr;capture.Reset();desktopCache.Reset();hasFrame=false;if(window)ShowWindow(window,SW_HIDE);shown=false;retry=GetTickCount64()+delay;
  }
  HRESULT Tick(){
    if(!OnOwnerThread())return RPC_E_WRONG_THREAD;
    if(!width)return S_OK;
    if(!IsWindow(owner)||MonitorFromWindow(owner,MONITOR_DEFAULTTONEAREST)!=monitor){LoseCapture(DXGI_ERROR_ACCESS_LOST,500);return lastError;}
    if(!capture){
      if(GetTickCount64()<retry)return lastError;
      HRESULT hr=output->DuplicateOutput(device.Get(),&capture);if(FAILED(hr)){LoseCapture(hr,1000);return hr;}lastError=S_OK;
    }
    DXGI_OUTDUPL_FRAME_INFO info{};ComPtr<IDXGIResource> resource;HRESULT hr=capture->AcquireNextFrame(0,&info,&resource);bool fresh=SUCCEEDED(hr);
    if(fresh){
      ComPtr<ID3D11Texture2D> desktop;hr=resource.As(&desktop);
      if(SUCCEEDED(hr)&&!desktopCache){D3D11_TEXTURE2D_DESC d{};desktop->GetDesc(&d);d.BindFlags=0;d.MiscFlags=0;d.CPUAccessFlags=0;d.Usage=D3D11_USAGE_DEFAULT;hr=device->CreateTexture2D(&d,nullptr,&desktopCache);}
      if(SUCCEEDED(hr)){context->CopyResource(desktopCache.Get(),desktop.Get());CopyCrop();}
      HRESULT releaseHr=capture->ReleaseFrame();if(SUCCEEDED(hr))hr=releaseHr;
      if(FAILED(hr)){LoseCapture(hr,500);return hr;}
    }else if(hr!=DXGI_ERROR_WAIT_TIMEOUT){LoseCapture(hr,500);return hr;}
    if(hasFrame&&(fresh||dirty)){hr=Draw();if(FAILED(hr)){LoseCapture(hr,500);return hr;}dirty=false;}
    lastError=S_OK;return S_OK;
  }
  int Test(){
    if(!OnOwnerThread())return (int)RPC_E_WRONG_THREAD;
    const int n=96;std::vector<unsigned char> shape(n*n,0);
    for(int y=0;y<n;y++)for(int x=0;x<n;x++){float d=40-sqrtf((x-47.5f)*(x-47.5f)+(y-47.5f)*(y-47.5f));shape[(size_t)y*n+x]=(unsigned char)(std::clamp(d+.5f,0.f,1.f)*255);}
    HRESULT hr=ConfigureMask(screen.left+120,screen.top+120,n,n,shape,0,1);if(FAILED(hr))return (int)hr;
    Texture result;hr=MakeTexture(result,n,n,DXGI_FORMAT_B8G8R8A8_UNORM,true);if(FAILED(hr))return (int)hr;
    D3D11_TEXTURE2D_DESC desc{};result.tex->GetDesc(&desc);desc.Usage=D3D11_USAGE_STAGING;desc.BindFlags=0;desc.CPUAccessFlags=D3D11_CPU_ACCESS_READ;ComPtr<ID3D11Texture2D> staging;hr=device->CreateTexture2D(&desc,nullptr,&staging);if(FAILED(hr))return (int)hr;
    Params p{(float)cropWidth,(float)cropHeight,(float)(bounds.left-crop.left),(float)(bounds.top-crop.top),(float)n,(float)n,0,0,opacity,0};std::vector<unsigned char> input((size_t)cropWidth*cropHeight*4),pixels(n*n*4);
    auto run=[&](float amount){context->UpdateSubresource(region.tex.Get(),0,nullptr,input.data(),cropWidth*4,0);p.sigma=amount;p.axis=0;auto src=region.srv.Get();if(amount>0){Pass(horizontal.rtv.Get(),src,blur.Get(),cropWidth,cropHeight,p);p.axis=1;Pass(vertical.rtv.Get(),horizontal.srv.Get(),blur.Get(),cropWidth,cropHeight,p);src=vertical.srv.Get();}Pass(result.rtv.Get(),src,lens.Get(),n,n,p);context->CopyResource(staging.Get(),result.tex.Get());D3D11_MAPPED_SUBRESOURCE map{};HRESULT read=context->Map(staging.Get(),0,D3D11_MAP_READ,0,&map);if(FAILED(read))return false;for(int y=0;y<n;y++)memcpy(pixels.data()+(size_t)y*n*4,(char*)map.pData+(size_t)y*map.RowPitch,n*4);context->Unmap(staging.Get(),0);return true;};
    int flags=0;bool ok=true;if(!run(18))return E_FAIL;for(int i=0;i<n*n;i++)if(pixels[i*4]||pixels[i*4+1]||pixels[i*4+2])ok=false;if(ok)flags|=1;
    for(int i=0;i<cropWidth*cropHeight;i++){input[i*4]=153;input[i*4+1]=102;input[i*4+2]=51;input[i*4+3]=255;}
    if(!run(18))return E_FAIL;ok=true;bool outside=true,premul=true;int covered=0;
    for(int i=0;i<n*n;i++){int a=pixels[i*4+3];if(a==255)covered++;for(int c=0;c<3;c++){if(std::abs((int)pixels[i*4+c]-(int)std::round((153-c*51)*a/255.f))>1)ok=false;if(pixels[i*4+c]>a)premul=false;if(shape[i]==0&&pixels[i*4+c])outside=false;}if(std::abs(a-(int)shape[i])>1)outside=false;}
    HRGN hitRegion=CreateRectRgn(0,0,0,0);if(GetWindowRgn(window,hitRegion)==ERROR)outside=false;for(int y=0;y<n;y++)for(int x=0;x<n;x++)if((PtInRegion(hitRegion,x,y)!=FALSE)!=(shape[(size_t)y*n+x]!=0))outside=false;DeleteObject(hitRegion);
    if(ok&&covered>1000)flags|=2;if(outside)flags|=4;if(premul)flags|=8;
    for(int y=0;y<cropHeight;y++)for(int x=0;x<cropWidth;x++){size_t i=((size_t)y*cropWidth+x)*4;unsigned char v=((x/3)%2)?255:0;input[i]=input[i+1]=input[i+2]=v;input[i+3]=255;}
    if(!run(0))return E_FAIL;double sharp=0;int dispersed=0;for(int y=32;y<64;y++)for(int x=32;x<64;x++)sharp+=std::abs((int)pixels[((size_t)y*n+x)*4]-128);for(int i=0;i<n*n;i++)if(pixels[i*4+3]==255&&std::abs((int)pixels[i*4]-(int)pixels[i*4+2])>8)dispersed++;if(dispersed>20)flags|=32;
    if(!run(8))return E_FAIL;double soft=0;for(int y=32;y<64;y++)for(int x=32;x<64;x++)soft+=std::abs((int)pixels[((size_t)y*n+x)*4]-128);if(soft<sharp*.5)flags|=16;return flags;
  }
};

static LRESULT CALLBACK GlassProc(HWND hwnd,UINT message,WPARAM wp,LPARAM lp){
  Glass* self=(Glass*)GetWindowLongPtrW(hwnd,GWLP_USERDATA);
  if(message==WM_NCCREATE){self=(Glass*)((CREATESTRUCTW*)lp)->lpCreateParams;SetWindowLongPtrW(hwnd,GWLP_USERDATA,(LONG_PTR)self);}
  if(message==WM_MOUSEACTIVATE)return MA_NOACTIVATE;
  if(message==WM_NCHITTEST)return HTTRANSPARENT;
  return DefWindowProcW(hwnd,message,wp,lp);
}

static std::mutex glassMutex;static Glass* singleton=nullptr;
static napi_value IntResult(napi_env env,HRESULT value){napi_value out=nullptr;napi.create_int32(env,(int32_t)value,&out);return out;}
static napi_value Undefined(napi_env env){napi_value out=nullptr;napi.get_undefined(env,&out);return out;}
static bool GetArgs(napi_env env,napi_callback_info info,size_t& count,napi_value* args){return napi.get_cb_info(env,info,&count,args,nullptr,nullptr)==0;}
static bool ReadFiniteNumber(napi_env env,napi_value value,double& out){napi_valuetype type;if(napi.typeof_value(env,value,&type)!=0||type!=napi_number||napi.get_value_double(env,value,&out)!=0)return false;return std::isfinite(out);}
static bool ReadInt32(napi_env env,napi_value value,int& out){double n;if(!ReadFiniteNumber(env,value,n)||std::floor(n)!=n||n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max())return false;out=(int)n;return true;}

static napi_value JsCreate(napi_env env,napi_callback_info info){
  napi_value args[1]{};size_t count=1;if(!GetArgs(env,info,count,args)||count!=1)return IntResult(env,E_INVALIDARG);
  void* data=nullptr;size_t length=0;if(napi.get_buffer_info(env,args[0],&data,&length)!=0||!data||length!=sizeof(HWND))return IntResult(env,E_INVALIDARG);
  HWND hwnd=nullptr;memcpy(&hwnd,data,sizeof(hwnd));std::lock_guard<std::mutex> lock(glassMutex);if(singleton)return IntResult(env,HRESULT_FROM_WIN32(ERROR_ALREADY_EXISTS));
  Glass* glass=new(std::nothrow) Glass();if(!glass)return IntResult(env,E_OUTOFMEMORY);HRESULT hr;try{hr=glass->Initialize(hwnd);}catch(const std::bad_alloc&){hr=E_OUTOFMEMORY;}catch(...){hr=E_FAIL;}if(FAILED(hr)){delete glass;return IntResult(env,hr);}singleton=glass;return IntResult(env,S_OK);
}
static napi_value JsConfigure(napi_env env,napi_callback_info info){
  napi_value args[7]{};size_t count=7;if(!GetArgs(env,info,count,args)||count!=7)return IntResult(env,E_INVALIDARG);
  int x,y,w,h;double blurValue,strengthValue;if(!ReadInt32(env,args[0],x)||!ReadInt32(env,args[1],y)||!ReadInt32(env,args[2],w)||!ReadInt32(env,args[3],h)||!ReadFiniteNumber(env,args[5],blurValue)||!ReadFiniteNumber(env,args[6],strengthValue)||blurValue<0||blurValue>18||strengthValue<0||strengthValue>1)return IntResult(env,E_INVALIDARG);
  bool isArray=false;if(napi.is_array(env,args[4],&isArray)!=0||!isArray)return IntResult(env,E_INVALIDARG);uint32_t length=0;if(napi.get_array_length(env,args[4],&length)!=0||length<6||(length&1)||length>MAX_POLYGON_COORDINATES)return IntResult(env,E_INVALIDARG);
  std::vector<PointF> points;try{points.reserve(length/2);for(uint32_t i=0;i<length;i+=2){napi_value xv=nullptr,yv=nullptr;double px,py;if(napi.get_element(env,args[4],i,&xv)!=0||napi.get_element(env,args[4],i+1,&yv)!=0||!ReadFiniteNumber(env,xv,px)||!ReadFiniteNumber(env,yv,py)||std::abs(px)>32768||std::abs(py)>32768)return IntResult(env,E_INVALIDARG);points.push_back(PointF{(float)px,(float)py});}}catch(...){return IntResult(env,E_OUTOFMEMORY);}
  std::vector<unsigned char> alpha;HRESULT hr;try{hr=RasterizePolygon(w,h,points,alpha);}catch(...){return IntResult(env,E_OUTOFMEMORY);}if(FAILED(hr))return IntResult(env,hr);
  std::lock_guard<std::mutex> lock(glassMutex);if(!singleton)return IntResult(env,E_HANDLE);try{hr=singleton->ConfigureMask(x,y,w,h,alpha,(float)blurValue,(float)strengthValue);}catch(...){hr=E_FAIL;}return IntResult(env,hr);
}
static napi_value MakeStatus(napi_env env,HRESULT error,uint64_t frames,bool created){
  napi_value out=nullptr,err=nullptr,frameValue=nullptr,createdValue=nullptr;napi.create_object(env,&out);napi.create_int32(env,(int32_t)error,&err);napi.create_double(env,(double)frames,&frameValue);napi.create_int32(env,created?1:0,&createdValue);napi.set_named_property(env,out,"error",err);napi.set_named_property(env,out,"frames",frameValue);napi.set_named_property(env,out,"created",createdValue);return out;
}
static napi_value MakeTickResult(napi_env env,HRESULT error,uint64_t frames){napi_value out=nullptr,err=nullptr,frameValue=nullptr;napi.create_object(env,&out);napi.create_int32(env,(int32_t)error,&err);napi.create_double(env,(double)frames,&frameValue);napi.set_named_property(env,out,"error",err);napi.set_named_property(env,out,"frames",frameValue);return out;}
static napi_value JsTick(napi_env env,napi_callback_info){std::lock_guard<std::mutex> lock(glassMutex);if(!singleton)return MakeTickResult(env,E_HANDLE,0);HRESULT hr;try{hr=singleton->Tick();}catch(...){hr=E_FAIL;}return MakeTickResult(env,hr,singleton->frames);}
static napi_value JsStatus(napi_env env,napi_callback_info){std::lock_guard<std::mutex> lock(glassMutex);return singleton?MakeStatus(env,singleton->lastError,singleton->frames,true):MakeStatus(env,S_OK,0,false);}
static napi_value JsTest(napi_env env,napi_callback_info){std::lock_guard<std::mutex> lock(glassMutex);if(!singleton)return IntResult(env,E_HANDLE);int result;try{result=singleton->Test();}catch(...){result=E_FAIL;}return IntResult(env,(HRESULT)result);}
static napi_value JsDestroy(napi_env env,napi_callback_info){std::lock_guard<std::mutex> lock(glassMutex);delete singleton;singleton=nullptr;return Undefined(env);}
static void __cdecl Cleanup(void*){std::lock_guard<std::mutex> lock(glassMutex);delete singleton;singleton=nullptr;}

extern "C" __declspec(dllexport) napi_value __cdecl napi_register_module_v1(napi_env env,napi_value exports){
  if(!ResolveNapi())return exports;
  const napi_property_descriptor properties[]={
    {"create",nullptr,JsCreate,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"configure",nullptr,JsConfigure,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"tick",nullptr,JsTick,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"destroy",nullptr,JsDestroy,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"test",nullptr,JsTest,nullptr,nullptr,nullptr,napi_default,nullptr},
    {"status",nullptr,JsStatus,nullptr,nullptr,nullptr,napi_default,nullptr}
  };
  napi.define_properties(env,exports,sizeof(properties)/sizeof(properties[0]),properties);napi.add_env_cleanup_hook(env,Cleanup,nullptr);return exports;
}

package com.csparkpos.qa;

import android.app.Application;
import com.facebook.react.*;
import com.facebook.react.bridge.*;
import com.facebook.react.uimanager.ViewManager;
import com.facebook.react.shell.MainReactPackage;
import com.facebook.react.modules.network.OkHttpClientFactory;
import com.facebook.react.modules.network.OkHttpClientProvider;
import com.facebook.soloader.SoLoader;
import io.realm.react.RealmReactPackage;
import com.rusel.RCTBluetoothSerial.RCTBluetoothSerialPackage;
import com.oblador.vectoricons.VectorIconsPackage;
import com.github.yamill.orientation.OrientationPackage;
import com.swmansion.rnscreens.RNScreensPackage;
import com.swmansion.reanimated.ReanimatedPackage;
import com.csparkpos.CustomBTModulePackage;
import java.util.*;
import java.io.IOException;
import okhttp3.*;

/** Only compiled into the explicit nativeqa variant. No telemetry initialization. */
public class QAApplication extends Application implements ReactApplication {
  private final ReactNativeHost host = new ReactNativeHost(this) {
    @Override public boolean getUseDeveloperSupport() { return false; }
    @Override protected String getJSMainModuleName() { return "native-qa/index"; }
    @Override protected List<ReactPackage> getPackages() {
      return Arrays.<ReactPackage>asList(new MainReactPackage(), new RealmReactPackage(),
        new RCTBluetoothSerialPackage(), new VectorIconsPackage(), new OrientationPackage(),
        new RNScreensPackage(), new ReanimatedPackage(), new CustomBTModulePackage(), new SafetyPackage());
    }
  };
  @Override public ReactNativeHost getReactNativeHost() { return host; }
  @Override public void onCreate() {
    super.onCreate();
    if (!getPackageName().equals("com.csparkpos.nativeqa")) throw new IllegalStateException("QA package isolation required");
    OkHttpClientProvider.setOkHttpClientFactory(new OkHttpClientFactory() {
      @Override public OkHttpClient createNewNetworkModuleClient() {
        return OkHttpClientProvider.createClientBuilder().addInterceptor(new Interceptor() {
          @Override public Response intercept(Chain chain) throws IOException {
            HttpUrl url = chain.request().url();
            if (!url.scheme().equals("http") || !url.host().equals("127.0.0.1") || (url.port()!=18764 && url.port()!=18765))
              throw new IOException("Native QA network allowlist denied destination");
            return chain.proceed(chain.request());
          }
        }).build();
      }
    });
    SoLoader.init(this, false);
  }
  private static class SafetyPackage implements ReactPackage {
    @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) { return Collections.emptyList(); }
    @Override public List<NativeModule> createNativeModules(final ReactApplicationContext context) {
      return Arrays.<NativeModule>asList(new SafetyModule(context));
    }
  }
  public static class SafetyModule extends ReactContextBaseJavaModule {
    public SafetyModule(ReactApplicationContext context) { super(context); }
    @Override public String getName() { return "QASafety"; }
    @Override public Map<String,Object> getConstants() {
      Map<String,Object> constants = new HashMap<>();
      constants.put("packageName",getReactApplicationContext().getPackageName());
      constants.put("networkAllowlist","127.0.0.1:18764,127.0.0.1:18765");
      return constants;
    }
    @ReactMethod public void getPrinterInfo(Promise promise) {
      WritableMap info=Arguments.createMap();WritableArray devices=Arguments.createArray();
      try {
        android.bluetooth.BluetoothAdapter adapter=android.bluetooth.BluetoothAdapter.getDefaultAdapter();
        info.putBoolean("available",adapter!=null);
        info.putBoolean("enabled",adapter!=null && adapter.isEnabled());
        if(adapter!=null) for(android.bluetooth.BluetoothDevice device:adapter.getBondedDevices()) {
          WritableMap row=Arguments.createMap();row.putString("name",device.getName());row.putString("address",device.getAddress());devices.pushMap(row);
        }
      } catch(SecurityException e) { info.putString("permissionError",e.getClass().getSimpleName()); }
      info.putArray("paired",devices);promise.resolve(info);
    }
  }
}

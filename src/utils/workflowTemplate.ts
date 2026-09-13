import { AppConfig } from '../types';
import { generateGoogleServicesJson } from './firebaseHelper';

/**
 * Generates an Android GitHub Actions workflow that compiles a real Android APK & AAB
 * faithfully matching all user configurations (App Icon, Colors, Splash, Permissions, Orientation, and Firebase FCM).
 */
export function generateWorkflowYml(config: AppConfig, iconBase64?: string): string {
  const safeAppName = (config.appName || 'Web2App').replace(/'/g, "\\'").replace(/"/g, '\\"');
  const safeTagline = (config.splash?.tagline || 'Aplikasi Resmi Android').replace(/'/g, "\\'").replace(/"/g, '\\"');
  const safeUrl = config.url || 'https://tokoonline-store.com';
  const safeThemeColor = config.themeColor || '#2563EB';
  const safeStatusBarColor = config.statusBarColor || '#1D4ED8';
  const safeNavBarColor = config.navBarColor || '#0F172A';
  const safeSplashBgColor = config.splash?.bgColor || config.statusBarColor || '#0F172A';
  const channelId = config.firebase?.channelId || 'promo_and_updates';
  const channelName = config.firebase?.channelName || 'Notifikasi & Info Promo';
  const orientationAttr = config.orientation && config.orientation !== 'unspecified' 
    ? `android:screenOrientation="${config.orientation}"` 
    : '';

  // Permission tags
  const permissionsList = [
    '          <uses-permission android:name="android.permission.INTERNET" />',
    '          <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
    '          <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
    '          <uses-permission android:name="android.permission.VIBRATE" />',
  ];
  if (config.permissions?.camera) {
    permissionsList.push('          <uses-permission android:name="android.permission.CAMERA" />');
    permissionsList.push('          <uses-feature android:name="android.hardware.camera" android:required="false" />');
  }
  if (config.permissions?.location) {
    permissionsList.push('          <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />');
    permissionsList.push('          <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />');
  }
  if (config.permissions?.storage) {
    permissionsList.push('          <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />');
    permissionsList.push('          <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />');
    permissionsList.push('          <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />');
  }
  if (config.permissions?.microphone) {
    permissionsList.push('          <uses-permission android:name="android.permission.RECORD_AUDIO" />');
  }

  // Splash Screen view block for activity_main.xml
  const splashLayoutXml = config.splash?.enabled ? `
              <!-- Native Splash Screen Overlay -->
              <LinearLayout
                  android:id="@+id/splashOverlay"
                  android:layout_width="match_parent"
                  android:layout_height="match_parent"
                  android:orientation="vertical"
                  android:gravity="center"
                  android:background="@color/splash_bg"
                  android:padding="24dp">

                  <ImageView
                      android:id="@+id/splashIcon"
                      android:layout_width="96dp"
                      android:layout_height="96dp"
                      android:src="@mipmap/ic_launcher"
                      android:contentDescription="@string/app_name" />

                  <TextView
                      android:layout_width="wrap_content"
                      android:layout_height="wrap_content"
                      android:layout_marginTop="16dp"
                      android:text="@string/app_name"
                      android:textColor="#FFFFFF"
                      android:textSize="20sp"
                      android:textStyle="bold" />

                  <TextView
                      android:layout_width="wrap_content"
                      android:layout_height="wrap_content"
                      android:layout_marginTop="8dp"
                      android:text="${safeTagline}"
                      android:textColor="#94A3B8"
                      android:textSize="14sp" />

                  <ProgressBar
                      android:layout_width="32dp"
                      android:layout_height="32dp"
                      android:layout_marginTop="32dp"
                      android:indeterminate="true" />
              </LinearLayout>` : '';

  // Splash Kotlin dismiss block
  const splashDuration = (config.splash?.durationSeconds || 2) * 1000;
  const splashDismissKt = config.splash?.enabled ? `
                  val splashOverlay = findViewById<View>(R.id.splashOverlay)
                  android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                      splashOverlay?.animate()
                          ?.alpha(0f)
                          ?.setDuration(400)
                          ?.withEndAction { splashOverlay.visibility = View.GONE }
                  }, ${splashDuration}L)
  ` : '';

  // Icon writing script (if base64 provided)
  const iconScript = iconBase64 ? `
          # Write Custom Icon from Web2App Studio
          mkdir -p android/app/src/main/res/drawable
          mkdir -p android/app/src/main/res/mipmap-mdpi
          mkdir -p android/app/src/main/res/mipmap-hdpi
          mkdir -p android/app/src/main/res/mipmap-xhdpi
          mkdir -p android/app/src/main/res/mipmap-xxhdpi
          mkdir -p android/app/src/main/res/mipmap-xxxhdpi

          printf '%s' "${iconBase64}" | base64 -d > android/app/src/main/res/drawable/ic_launcher.png
          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-mdpi/ic_launcher.png
          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-hdpi/ic_launcher.png
          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png

          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
          cp android/app/src/main/res/drawable/ic_launcher.png android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
` : `
          # Fallback Vector Icon with App Theme Color
          mkdir -p android/app/src/main/res/drawable
          mkdir -p android/app/src/main/res/mipmap-anydpi-v26
          cat << 'EOF' > android/app/src/main/res/drawable/ic_launcher.xml
          <vector xmlns:android="http://schemas.android.com/apk/res/android"
              android:width="108dp"
              android:height="108dp"
              android:viewportWidth="108"
              android:viewportHeight="108">
              <path android:fillColor="${safeThemeColor}" android:pathData="M0,0h108v108h-108z"/>
              <path android:fillColor="#FFFFFF" android:pathData="M35,24h38c6.075,0 11,4.925 11,11v38c0,6.075 -4.925,11 -11,11h-38c-6.075,0 -11,-4.925 -11,-11v-38c0,-6.075 4.925,-11 11,-11z"/>
              <path android:fillColor="${safeThemeColor}" android:pathData="M42,32h24c3.314,0 6,2.686 6,6v32c0,3.314 -2.686,6 -6,6h-24c-3.314,0 -6,-2.686 -6,-6v-32c0,-3.314 2.686,-6 6,-6z"/>
          </vector>
          EOF
          cp android/app/src/main/res/drawable/ic_launcher.xml android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
          cp android/app/src/main/res/drawable/ic_launcher.xml android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
`;

  const googleServicesJson = generateGoogleServicesJson(config);
  const googleServicesJsonBase64 = typeof Buffer !== 'undefined'
    ? Buffer.from(googleServicesJson, 'utf8').toString('base64')
    : btoa(unescape(encodeURIComponent(googleServicesJson)));

  return `name: Build Real Android APK & AAB

on:
  workflow_dispatch:
    inputs:
      target_url:
        description: 'URL Website untuk dijadikan aplikasi Android'
        required: true
        default: '${safeUrl}'
      app_name:
        description: 'Nama Aplikasi Android'
        required: true
        default: '${safeAppName}'
      package_name:
        description: 'Package Name / Application ID'
        required: true
        default: '${config.packageName || 'com.web2app.app'}'
      theme_color:
        description: 'Warna Tema Utama'
        required: false
        default: '${safeThemeColor}'
      status_bar_color:
        description: 'Warna Status Bar'
        required: false
        default: '${safeStatusBarColor}'
      nav_bar_color:
        description: 'Warna Navigation Bar'
        required: false
        default: '${safeNavBarColor}'

permissions:
  contents: write

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Set up Java 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Install Gradle 8.4
        run: |
          wget -q https://services.gradle.org/distributions/gradle-8.4-bin.zip
          unzip -q gradle-8.4-bin.zip -d /opt
          echo "/opt/gradle-8.4/bin" >> $GITHUB_PATH

      - name: Accept Android SDK Licenses
        run: |
          export ANDROID_HOME=/usr/local/lib/android/sdk
          export ANDROID_SDK_ROOT=/usr/local/lib/android/sdk
          yes | /usr/local/lib/android/sdk/cmdline-tools/latest/bin/sdkmanager --licenses || true

      - name: Configure Android Project & Gradle Build System
        env:
          INPUT_TARGET_URL: \${{ github.event.inputs.target_url }}
          INPUT_APP_NAME: \${{ github.event.inputs.app_name }}
          INPUT_PKG_NAME: \${{ github.event.inputs.package_name }}
          INPUT_THEME_COLOR: \${{ github.event.inputs.theme_color }}
          INPUT_STATUS_BAR_COLOR: \${{ github.event.inputs.status_bar_color }}
          INPUT_NAV_BAR_COLOR: \${{ github.event.inputs.nav_bar_color }}
        run: |
          RAW_TARGET_URL="$INPUT_TARGET_URL"
          RAW_APP_NAME="$INPUT_APP_NAME"
          RAW_PKG_NAME="$INPUT_PKG_NAME"
          RAW_THEME_COLOR="$INPUT_THEME_COLOR"
          RAW_STATUS_BAR_COLOR="$INPUT_STATUS_BAR_COLOR"
          RAW_NAV_BAR_COLOR="$INPUT_NAV_BAR_COLOR"

          if [ -z "$RAW_TARGET_URL" ]; then
            RAW_TARGET_URL="${safeUrl}"
          fi
          if [ -z "$RAW_APP_NAME" ]; then
            RAW_APP_NAME="${safeAppName}"
          fi
          if [ -z "$RAW_PKG_NAME" ]; then
            RAW_PKG_NAME="${config.packageName || 'com.web2app.app'}"
          fi
          if [ -z "$RAW_THEME_COLOR" ]; then
            RAW_THEME_COLOR="${safeThemeColor}"
          fi
          if [ -z "$RAW_STATUS_BAR_COLOR" ]; then
            RAW_STATUS_BAR_COLOR="${safeStatusBarColor}"
          fi
          if [ -z "$RAW_NAV_BAR_COLOR" ]; then
            RAW_NAV_BAR_COLOR="${safeNavBarColor}"
          fi

          # Sanitize package name (letters, digits, underscores, dots)
          PKG_NAME=$(echo "$RAW_PKG_NAME" | tr -d ' ' | tr -cd '[:alnum:]._')
          if [[ "$PKG_NAME" != *.* ]]; then
            PKG_NAME="com.web2app.$PKG_NAME"
          fi

          # Sanitize Target URL
          TARGET_URL="$RAW_TARGET_URL"
          if [[ ! "$TARGET_URL" =~ ^https?:// ]]; then
            TARGET_URL="https://$TARGET_URL"
          fi

          # Sanitize App Name for XML
          APP_NAME="$RAW_APP_NAME"
          SAFE_APP_NAME=$(echo "$APP_NAME" | sed "s/'/\\\\'/g" | sed 's/&/\\&amp;/g' | sed 's/</\\&lt;/g' | sed 's/>/\\&gt;/g')
          SAFE_TARGET_URL=$(echo "$TARGET_URL" | sed 's/&/\\&amp;/g')

          # Calculate package directory path
          PKG_DIR=$(echo "$PKG_NAME" | tr '.' '/')

          # Export variables to GITHUB_ENV so all later steps have them cleanly
          echo "PKG_NAME=$PKG_NAME" >> $GITHUB_ENV
          echo "PKG_DIR=$PKG_DIR" >> $GITHUB_ENV
          echo "APP_NAME=$APP_NAME" >> $GITHUB_ENV
          echo "SAFE_APP_NAME=$SAFE_APP_NAME" >> $GITHUB_ENV
          echo "TARGET_URL=$TARGET_URL" >> $GITHUB_ENV
          echo "SAFE_TARGET_URL=$SAFE_TARGET_URL" >> $GITHUB_ENV
          echo "RAW_THEME_COLOR=$RAW_THEME_COLOR" >> $GITHUB_ENV
          echo "RAW_STATUS_BAR_COLOR=$RAW_STATUS_BAR_COLOR" >> $GITHUB_ENV
          echo "RAW_NAV_BAR_COLOR=$RAW_NAV_BAR_COLOR" >> $GITHUB_ENV

          # Create directory structure
          mkdir -p "android/app/src/main/java/$PKG_DIR"
          mkdir -p android/app/src/main/res/values
          mkdir -p android/app/src/main/res/layout
          mkdir -p android/app/src/main/res/drawable

          # 1. settings.gradle.kts
          cat << 'EOF' > android/settings.gradle.kts
          pluginManagement {
              repositories {
                  google()
                  mavenCentral()
                  gradlePluginPortal()
              }
          }
          dependencyResolutionManagement {
              repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
              repositories {
                  google()
                  mavenCentral()
              }
          }
          rootProject.name = "Web2App"
          include(":app")
          EOF

          # 2. Root build.gradle.kts with Google Services support
          cat << 'EOF' > android/build.gradle.kts
          plugins {
              id("com.android.application") version "8.3.2" apply false
              id("org.jetbrains.kotlin.android") version "1.9.22" apply false
              id("com.google.gms.google-services") version "4.4.2" apply false
          }
          EOF

          # 3. gradle.properties
          cat << 'EOF' > android/gradle.properties
          org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
          android.useAndroidX=true
          android.builder.sdkDownload=true
          EOF

          # 4. App build.gradle.kts with Firebase & WebKit
          cat << EOF > android/app/build.gradle.kts
          plugins {
              id("com.android.application")
              id("org.jetbrains.kotlin.android")
              id("com.google.gms.google-services")
          }

          android {
              namespace = "$PKG_NAME"
              compileSdk = 34

              defaultConfig {
                  applicationId = "$PKG_NAME"
                  minSdk = ${config.minSdk || 24}
                  targetSdk = 34
                  versionCode = ${config.versionCode || 1}
                  versionName = "${config.versionName || '1.0.0'}"
              }

              signingConfigs {
                  create("release") {
                      storeFile = file("release.keystore")
                      storePassword = "${config.keystore?.storePassword || 'Password123!'}"
                      keyAlias = "${config.keystore?.alias || 'release-key'}"
                      keyPassword = "${config.keystore?.keyPassword || 'Password123!'}"
                  }
              }

              buildTypes {
                  release {
                      isMinifyEnabled = false
                      signingConfig = signingConfigs.getByName("release")
                      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
                  }
                  debug {
                      isDebuggable = true
                      signingConfig = signingConfigs.getByName("release")
                  }
              }
              compileOptions {
                  sourceCompatibility = JavaVersion.VERSION_17
                  targetCompatibility = JavaVersion.VERSION_17
              }
              kotlinOptions {
                  jvmTarget = "17"
              }
          }

          dependencies {
              implementation("androidx.core:core-ktx:1.13.1")
              implementation("androidx.appcompat:appcompat:1.7.0")
              implementation("com.google.android.material:material:1.12.0")
              implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
              implementation("androidx.webkit:webkit:1.11.0")
              implementation("androidx.activity:activity-ktx:1.9.2")

              // Firebase Cloud Messaging (FCM) & BoM
              implementation(platform("com.google.firebase:firebase-bom:33.7.0"))
              implementation("com.google.firebase:firebase-messaging-ktx")
          }
          EOF

          # Proguard rules file
          touch android/app/proguard-rules.pro

      - name: Generate App Icons & Signing Keystore
        run: |
          mkdir -p android/app/src/main/res/drawable
          mkdir -p android/app/src/main/res/mipmap-anydpi-v26
          mkdir -p android/app/src/main/res/mipmap-hdpi
          mkdir -p android/app/src/main/res/mipmap-mdpi
          mkdir -p android/app/src/main/res/mipmap-xhdpi
          mkdir -p android/app/src/main/res/mipmap-xxhdpi
          mkdir -p android/app/src/main/res/mipmap-xxxhdpi

          ${iconScript}

          # Generate Keystore for signing Release APK and AAB
          keytool -genkeypair -v \
            -keystore android/app/release.keystore \
            -alias "${config.keystore?.alias || 'release-key'}" \
            -keyalg RSA \
            -keysize 2048 \
            -validity 10000 \
            -storepass "${config.keystore?.storePassword || 'Password123!'}" \
            -keypass "${config.keystore?.keyPassword || 'Password123!'}" \
            -dname "CN=$SAFE_APP_NAME, O=Web2App, C=ID"

      - name: Generate Android Resources & Manifest
        run: |
          # 5. Strings and values
          cat << EOF > android/app/src/main/res/values/strings.xml
          <resources>
              <string name="app_name">$SAFE_APP_NAME</string>
              <string name="target_url">$SAFE_TARGET_URL</string>
              <bool name="pull_to_refresh_enabled">${config.permissions?.pullToRefresh ? 'true' : 'false'}</bool>
          </resources>
          EOF

          cat << EOF > android/app/src/main/res/values/colors.xml
          <resources>
              <color name="primary">$RAW_THEME_COLOR</color>
              <color name="status_bar">$RAW_STATUS_BAR_COLOR</color>
              <color name="nav_bar">$RAW_NAV_BAR_COLOR</color>
              <color name="splash_bg">${safeSplashBgColor}</color>
          </resources>
          EOF

          cat << 'EOF' > android/app/src/main/res/values/styles.xml
          <resources>
              <style name="Theme.Web2App" parent="Theme.AppCompat.Light.NoActionBar">
                  <item name="colorPrimary">@color/primary</item>
                  <item name="colorPrimaryDark">@color/status_bar</item>
                  <item name="android:statusBarColor">@color/status_bar</item>
                  <item name="android:navigationBarColor">@color/nav_bar</item>
              </style>
          </resources>
          EOF

          # 6. Embedded google-services.json for Firebase Push Notifications
          printf '%s' "${googleServicesJsonBase64}" | base64 -d > android/app/google-services.json

          # 7. Layout activity_main.xml (clean full viewport)
          cat << 'EOF' > android/app/src/main/res/layout/activity_main.xml
          <?xml version="1.0" encoding="utf-8"?>
          <FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
              android:layout_width="match_parent"
              android:layout_height="match_parent"
              android:background="#FFFFFF">

              <androidx.swiperefreshlayout.widget.SwipeRefreshLayout 
                  android:id="@+id/swipeRefresh"
                  android:layout_width="match_parent"
                  android:layout_height="match_parent">

                  <FrameLayout
                      android:layout_width="match_parent"
                      android:layout_height="match_parent">

                      <WebView
                          android:id="@+id/webView"
                          android:layout_width="match_parent"
                          android:layout_height="match_parent" />

                      <ProgressBar
                          android:id="@+id/progressBar"
                          style="?android:attr/progressBarStyleHorizontal"
                          android:layout_width="match_parent"
                          android:layout_height="3dp"
                          android:indeterminate="false"
                          android:max="100" />
                  </FrameLayout>
              </androidx.swiperefreshlayout.widget.SwipeRefreshLayout>
              ${splashLayoutXml}
          </FrameLayout>
          EOF

          # 8. AndroidManifest.xml
          cat << 'EOF' > android/app/src/main/AndroidManifest.xml
          <?xml version="1.0" encoding="utf-8"?>
          <manifest xmlns:android="http://schemas.android.com/apk/res/android">
          ${permissionsList.join('\n')}

              <application
                  android:allowBackup="true"
                  android:icon="@mipmap/ic_launcher"
                  android:roundIcon="@mipmap/ic_launcher_round"
                  android:label="@string/app_name"
                  android:theme="@style/Theme.Web2App"
                  android:usesCleartextTraffic="true">
                  <activity
                      android:name=".MainActivity"
                      android:exported="true"
                      ${orientationAttr}
                      android:configChanges="orientation|screenSize|keyboardHidden">
                      <intent-filter>
                          <action android:name="android.intent.action.MAIN" />
                          <category android:name="android.intent.category.LAUNCHER" />
                      </intent-filter>
                  </activity>

                  <!-- Firebase Cloud Messaging Receiver Service -->
                  <service
                      android:name=".MyFirebaseMessagingService"
                      android:exported="false">
                      <intent-filter>
                          <action android:name="com.google.firebase.MESSAGING_EVENT" />
                      </intent-filter>
                  </service>

                  <meta-data
                      android:name="com.google.firebase.messaging.default_notification_channel_id"
                      android:value="${channelId}" />
                  <meta-data
                      android:name="com.google.firebase.messaging.default_notification_color"
                      android:resource="@color/primary" />
              </application>
          </manifest>
          EOF

      - name: Generate Firebase Cloud Messaging Service
        run: |
          mkdir -p "android/app/src/main/java/$PKG_DIR"
          # 9. MyFirebaseMessagingService.kt
          cat << 'EOF' > "android/app/src/main/java/$PKG_DIR/MyFirebaseMessagingService.kt"
          package $PKG_NAME

          import android.app.NotificationChannel
          import android.app.NotificationManager
          import android.app.PendingIntent
          import android.content.Context
          import android.content.Intent
          import android.graphics.Color
          import android.media.RingtoneManager
          import android.os.Build
          import android.util.Log
          import androidx.core.app.NotificationCompat
          import com.google.firebase.messaging.FirebaseMessagingService
          import com.google.firebase.messaging.RemoteMessage

          class MyFirebaseMessagingService : FirebaseMessagingService() {

              companion object {
                  private const val TAG = "FCM_Service"
                  const val CHANNEL_ID = "${channelId}"
                  const val CHANNEL_NAME = "${channelName}"
              }

              override fun onNewToken(token: String) {
                  super.onNewToken(token)
                  Log.d(TAG, "Refreshed FCM Token: \$token")
                  val prefs = getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                  prefs.edit().putString("fcm_token", token).apply()
              }

              override fun onMessageReceived(remoteMessage: RemoteMessage) {
                  super.onMessageReceived(remoteMessage)
                  Log.d(TAG, "Pesan masuk FCM: \${remoteMessage.data}")

                  val title = remoteMessage.notification?.title 
                      ?: remoteMessage.data["title"] 
                      ?: getString(R.string.app_name)
                      
                  val body = remoteMessage.notification?.body 
                      ?: remoteMessage.data["body"] 
                      ?: "Anda menerima pesan baru"

                  val targetUrl = remoteMessage.data["target_url"] 
                      ?: remoteMessage.data["url"] 
                      ?: getString(R.string.target_url)

                  showNotification(title, body, targetUrl)
              }

              private fun showNotification(title: String, messageBody: String, targetUrl: String) {
                  val intent = Intent(this, MainActivity::class.java).apply {
                      addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                      putExtra("target_url", targetUrl)
                  }

                  val pendingIntent = PendingIntent.getActivity(
                      this,
                      System.currentTimeMillis().toInt(),
                      intent,
                      PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
                  )

                  val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                  val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

                  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                      val channel = NotificationChannel(
                          CHANNEL_ID,
                          CHANNEL_NAME,
                          NotificationManager.IMPORTANCE_HIGH
                      ).apply {
                          description = "Saluran resmi notifikasi \${getString(R.string.app_name)}"
                          enableLights(true)
                          lightColor = Color.parseColor("$RAW_THEME_COLOR")
                          enableVibration(true)
                      }
                      notificationManager.createNotificationChannel(channel)
                  }

                  val notificationBuilder = NotificationCompat.Builder(this, CHANNEL_ID)
                      .setSmallIcon(R.mipmap.ic_launcher)
                      .setContentTitle(title)
                      .setContentText(messageBody)
                      .setStyle(NotificationCompat.BigTextStyle().bigText(messageBody))
                      .setAutoCancel(true)
                      .setSound(defaultSoundUri)
                      .setVibrate(longArrayOf(0, 250, 200, 250))
                      .setColor(Color.parseColor("$RAW_THEME_COLOR"))
                      .setPriority(NotificationCompat.PRIORITY_HIGH)
                      .setContentIntent(pendingIntent)

                  val notificationId = (System.currentTimeMillis() % 10000).toInt()
                  notificationManager.notify(notificationId, notificationBuilder.build())
              }
          }
          EOF

      - name: Generate Android MainActivity & WebView Controller
        run: |
          mkdir -p "android/app/src/main/java/$PKG_DIR"
          # 10. MainActivity.kt with Notifications, File Chooser, Back Handler, and Deep Links
          cat << EOF > "android/app/src/main/java/$PKG_DIR/MainActivity.kt"
          package $PKG_NAME

          import android.Manifest
          import android.annotation.SuppressLint
          import android.app.NotificationChannel
          import android.app.NotificationManager
          import android.content.Context
          import android.content.Intent
          import android.content.pm.PackageManager
          import android.graphics.Bitmap
          import android.graphics.Color
          import android.net.Uri
          import android.os.Build
          import android.os.Bundle
          import android.util.Log
          import android.view.View
          import android.webkit.CookieManager
          import android.webkit.GeolocationPermissions
          import android.webkit.ValueCallback
          import android.webkit.WebChromeClient
          import android.webkit.WebResourceError
          import android.webkit.WebResourceRequest
          import android.webkit.WebSettings
          import android.webkit.WebView
          import android.webkit.WebViewClient
          import android.widget.ProgressBar
          import android.widget.Toast
          import androidx.activity.OnBackPressedCallback
          import androidx.activity.result.contract.ActivityResultContracts
          import androidx.appcompat.app.AppCompatActivity
          import androidx.core.content.ContextCompat
          import androidx.core.graphics.ColorUtils
          import androidx.core.view.WindowInsetsControllerCompat
          import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
          import com.google.firebase.messaging.FirebaseMessaging

          class MainActivity : AppCompatActivity() {
              private lateinit var webView: WebView
              private lateinit var swipeRefresh: SwipeRefreshLayout
              private lateinit var progressBar: ProgressBar
              private var fileUploadCallback: ValueCallback<Array<Uri>>? = null

              // Runtime Permission for Push Notifications (Android 13+ / API 33+)
              private val notificationPermissionLauncher = registerForActivityResult(
                  ActivityResultContracts.RequestPermission()
              ) { isGranted ->
                  if (isGranted) {
                      Log.d("MainActivity", "Izin notifikasi disetujui")
                  } else {
                      Log.w("MainActivity", "Izin notifikasi ditolak oleh pengguna")
                  }
              }

              // File Chooser for camera & gallery uploads
              private val fileChooserLauncher = registerForActivityResult(
                  ActivityResultContracts.StartActivityForResult()
              ) { result ->
                  if (result.resultCode == RESULT_OK) {
                      val data = result.data
                      val results: Array<Uri>? = when {
                          data?.dataString != null -> arrayOf(Uri.parse(data.dataString))
                          data?.clipData != null -> {
                              val count = data.clipData!!.itemCount
                              Array(count) { i -> data.clipData!!.getItemAt(i).uri }
                          }
                          else -> null
                      }
                      fileUploadCallback?.onReceiveValue(results)
                  } else {
                      fileUploadCallback?.onReceiveValue(null)
                  }
                  fileUploadCallback = null
              }

              @SuppressLint("SetJavaScriptEnabled")
              override fun onCreate(savedInstanceState: Bundle?) {
                  super.onCreate(savedInstanceState)
                  setContentView(R.layout.activity_main)

                  setupSystemBars()
                  setupNotificationChannel()
                  requestNotificationPermission()
                  setupFCM()

                  webView = findViewById(R.id.webView)
                  swipeRefresh = findViewById(R.id.swipeRefresh)
                  progressBar = findViewById(R.id.progressBar)

                  setupWebView()
                  setupSwipeRefresh()
                  setupBackNavigation()
                  handleNotificationIntent(intent)

                  ${splashDismissKt}

                  val initialUrl = intent.getStringExtra("target_url") ?: getString(R.string.target_url)
                  webView.loadUrl(initialUrl)
              }

              override fun onNewIntent(intent: Intent) {
                  super.onNewIntent(intent)
                  handleNotificationIntent(intent)
              }

              private fun handleNotificationIntent(intent: Intent?) {
                  val pushUrl = intent?.getStringExtra("target_url")
                  if (!pushUrl.isNullOrEmpty() && ::webView.isInitialized) {
                      webView.loadUrl(pushUrl)
                  }
              }

              private fun setupSystemBars() {
                  try {
                      val statusColor = Color.parseColor("$RAW_STATUS_BAR_COLOR")
                      val navColor = Color.parseColor("$RAW_NAV_BAR_COLOR")
                      window.statusBarColor = statusColor
                      window.navigationBarColor = navColor

                      val windowInsetsController = WindowInsetsControllerCompat(window, window.decorView)
                      val isLightStatus = ColorUtils.calculateLuminance(statusColor) > 0.5
                      val isLightNav = ColorUtils.calculateLuminance(navColor) > 0.5
                      windowInsetsController.isAppearanceLightStatusBars = isLightStatus
                      windowInsetsController.isAppearanceLightNavigationBars = isLightNav
                  } catch (e: Exception) {
                      Log.e("MainActivity", "Error setting system bar colors", e)
                  }
              }

              private fun setupNotificationChannel() {
                  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                      try {
                          val channelId = "${channelId}"
                          val channelName = "${channelName}"
                          val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                          val channel = NotificationChannel(
                              channelId,
                              channelName,
                              NotificationManager.IMPORTANCE_HIGH
                          ).apply {
                              description = "Saluran resmi notifikasi \${getString(R.string.app_name)}"
                              enableLights(true)
                              enableVibration(true)
                          }
                          manager.createNotificationChannel(channel)
                      } catch (e: Exception) {
                          Log.e("MainActivity", "Error creating notification channel", e)
                      }
                  }
              }

              private fun requestNotificationPermission() {
                  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                      if (ContextCompat.checkSelfPermission(
                              this,
                              Manifest.permission.POST_NOTIFICATIONS
                          ) != PackageManager.PERMISSION_GRANTED
                      ) {
                          notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                      }
                  }
              }

              private fun setupFCM() {
                  try {
                      FirebaseMessaging.getInstance().subscribeToTopic("all_users")
                          .addOnCompleteListener { task ->
                              if (task.isSuccessful) {
                                  Log.d("FCM", "Berhasil berlangganan topik: all_users")
                              }
                          }

                      FirebaseMessaging.getInstance().token
                          .addOnCompleteListener { task ->
                              if (task.isSuccessful) {
                                  val token = task.result
                                  Log.d("FCM", "FCM Registration Token: \$token")
                                  val prefs = getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                                  prefs.edit().putString("fcm_token", token).apply()
                              }
                          }
                  } catch (e: Exception) {
                      Log.w("FCM", "FCM setup status: \${e.message}")
                  }
              }

              @SuppressLint("SetJavaScriptEnabled")
              private fun setupWebView() {
                  val cookieManager = CookieManager.getInstance()
                  cookieManager.setAcceptCookie(true)
                  cookieManager.setAcceptThirdPartyCookies(webView, true)

                  webView.settings.apply {
                      javaScriptEnabled = true
                      domStorageEnabled = true
                      databaseEnabled = true
                      allowFileAccess = true
                      allowContentAccess = true
                      useWideViewPort = true
                      loadWithOverviewMode = true
                      setSupportZoom(true)
                      builtInZoomControls = true
                      displayZoomControls = false
                      mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                      cacheMode = WebSettings.LOAD_DEFAULT
                      mediaPlaybackRequiresUserGesture = false
                      javaScriptCanOpenWindowsAutomatically = true
                      val defaultUa = userAgentString
                      userAgentString = "$defaultUa Web2App/1.0"
                  }

                  webView.webViewClient = object : WebViewClient() {
                      override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                          progressBar.visibility = View.VISIBLE
                      }

                      override fun onPageFinished(view: WebView?, url: String?) {
                          progressBar.visibility = View.GONE
                          swipeRefresh.isRefreshing = false
                      }

                      override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                          val url = request?.url?.toString() ?: return false
                          val targetHost = Uri.parse(getString(R.string.target_url)).host

                          if (url.startsWith("tel:") || url.startsWith("mailto:") || 
                              url.startsWith("whatsapp:") || url.startsWith("sms:") ||
                              url.startsWith("geo:") || url.startsWith("intent:") ||
                              url.startsWith("market:")) {
                              try {
                                  val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                  startActivity(intent)
                                  return true
                              } catch (e: Exception) {
                                  Toast.makeText(this@MainActivity, "Aplikasi pendukung tidak terpasang di perangkat", Toast.LENGTH_SHORT).show()
                                  return true
                              }
                          }

                          val uriHost = Uri.parse(url).host
                          if (uriHost != null && targetHost != null && uriHost.contains(targetHost)) {
                              return false
                          }

                          try {
                              val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                              startActivity(browserIntent)
                              return true
                          } catch (e: Exception) {
                              return false
                          }
                      }

                      override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                          if (request?.isForMainFrame == true) {
                              progressBar.visibility = View.GONE
                              swipeRefresh.isRefreshing = false
                          }
                      }
                  }

                  webView.webChromeClient = object : WebChromeClient() {
                      override fun onProgressChanged(view: WebView?, newProgress: Int) {
                          progressBar.progress = newProgress
                          if (newProgress >= 100) progressBar.visibility = View.GONE
                      }

                      override fun onShowFileChooser(
                          webView: WebView?,
                          filePathCallback: ValueCallback<Array<Uri>>?,
                          fileChooserParams: FileChooserParams?
                      ): Boolean {
                          fileUploadCallback?.onReceiveValue(null)
                          fileUploadCallback = filePathCallback

                          val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                              type = "*/*"
                              addCategory(Intent.CATEGORY_OPENABLE)
                          }
                          try {
                              fileChooserLauncher.launch(intent)
                          } catch (e: Exception) {
                              fileUploadCallback = null
                              return false
                          }
                          return true
                      }

                      override fun onGeolocationPermissionsShowPrompt(
                          origin: String?,
                          callback: GeolocationPermissions.Callback?
                      ) {
                          callback?.invoke(origin, true, false)
                      }
                  }
              }

              private fun setupSwipeRefresh() {
                  val pullRefreshEnabled = resources.getBoolean(R.bool.pull_to_refresh_enabled)
                  swipeRefresh.isEnabled = pullRefreshEnabled
                  if (pullRefreshEnabled) {
                      swipeRefresh.setOnRefreshListener {
                          webView.reload()
                      }
                  }
              }

              private fun setupBackNavigation() {
                  onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
                      override fun handleOnBackPressed() {
                          if (webView.canGoBack()) {
                              webView.goBack()
                          } else {
                              finish()
                          }
                      }
                  })
              }
          }
          EOF

      - name: Build Android Release APK & AAB Bundle
        working-directory: android
        run: |
          export ANDROID_HOME=/usr/local/lib/android/sdk
          export ANDROID_SDK_ROOT=/usr/local/lib/android/sdk
          gradle assembleRelease bundleRelease assembleDebug --no-daemon --stacktrace

      - name: Upload Real Signed Release APK Artifact (~10 MB)
        uses: actions/upload-artifact@v4
        with:
          name: app-release-signed-apk
          path: android/app/build/outputs/apk/release/app-release.apk
          if-no-files-found: error

      - name: Upload Google Play Store AAB Bundle
        uses: actions/upload-artifact@v4
        with:
          name: app-release-bundle-aab
          path: android/app/build/outputs/bundle/release/app-release.aab
          if-no-files-found: warn

      - name: Upload Debug APK
        uses: actions/upload-artifact@v4
        with:
          name: app-debug-real-apk
          path: android/app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: warn
`;
}

export const LATEST_WORKFLOW_YML = generateWorkflowYml({
  url: 'https://tokoonline-store.com',
  appName: 'Web2App',
  packageName: 'com.web2app.app',
  versionName: '1.0.0',
  versionCode: 1,
  themeColor: '#2563EB',
  statusBarColor: '#1D4ED8',
  navBarColor: '#0F172A',
  orientation: 'portrait',
  architecture: 'webview',
  targetSdk: 34,
  minSdk: 24,
  permissions: {
    camera: true,
    location: true,
    storage: true,
    microphone: false,
    notifications: true,
    pullToRefresh: true,
    offlineCache: true,
    externalLinks: true,
    fullscreen: false,
  },
  keystore: {
    alias: 'release-key',
    storePassword: 'Password123!',
    keyPassword: 'Password123!',
    validityYears: 30,
    organization: 'Web2App',
    countryCode: 'ID',
    sha1: '',
    sha256: '',
  },
  icon: {
    type: 'emoji',
    value: '🛍️',
    bgColor: '#2563EB',
    shape: 'squircle',
  },
  splash: {
    enabled: true,
    durationSeconds: 2,
    bgColor: '#0F172A',
    tagline: 'Aplikasi Resmi Android',
  },
  playStore: {
    shortDesc: '',
    fullDesc: '',
    category: '',
    contactEmail: '',
    privacyPolicyUrl: '',
  },
  firebase: {
    enabled: true,
    projectId: 'web2app-fcm-project',
    appId: '1:982347102938:android:72834b92c81d',
    apiKey: 'AIzaSyD-X92kL10mNq947-fcmKeyDemo',
    messagingSenderId: '982347102938',
    serverKey: '',
    channelId: 'promo_and_updates',
    channelName: 'Notifikasi & Info Promo',
    soundEnabled: true,
    vibrateEnabled: true,
    badgeEnabled: true,
  },
});

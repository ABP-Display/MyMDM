package org.mymdm.agent.kiosk

import android.net.http.SslError
import android.webkit.SslErrorHandler
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceResponse
import android.graphics.Bitmap
import java.io.ByteArrayInputStream
import org.mymdm.agent.api.models.Policy

class KioskWebViewClient(private val policy: Policy) : WebViewClient() {
    private fun allowed(url: String) = WebNavigationPolicy.allows(url, policy.url, policy.kioskType, policy.allowedOrigins)

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val url = request.url.toString()
        return !allowed(url)
    }

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        if (request.isForMainFrame && !allowed(request.url.toString())) {
            return WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream("Navigation non autorisée".toByteArray()))
        }
        return null
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
        if (url != "about:blank" && !allowed(url)) {
            view.stopLoading()
            view.loadDataWithBaseURL(null, "<html><body>Navigation non autorisée par la configuration.</body></html>", "text/html", "UTF-8", null)
        }
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
        if (url != "about:blank" && !allowed(url)) {
            view.stopLoading()
            view.loadDataWithBaseURL(null, "<html><body>Navigation non autorisée par la configuration.</body></html>", "text/html", "UTF-8", null)
        }
    }

    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
    }
}

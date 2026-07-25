package uz.olympy.duel.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import uz.olympy.duel.ws.DuelWebSocketHandler;

/**
 * Registers the raw WebSocket endpoint {@code /ws/duel} with the auth handshake
 * interceptor. Clients connect as {@code /ws/duel?token=<jwt>&matchId=<id>}.
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final DuelWebSocketHandler handler;
    private final AuthHandshakeInterceptor authInterceptor;

    public WebSocketConfig(DuelWebSocketHandler handler, AuthHandshakeInterceptor authInterceptor) {
        this.handler = handler;
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/duel")
                .addInterceptors(authInterceptor)
                .setAllowedOriginPatterns("*");
    }
}

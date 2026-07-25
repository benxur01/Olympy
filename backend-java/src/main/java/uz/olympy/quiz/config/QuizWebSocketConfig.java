package uz.olympy.quiz.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import uz.olympy.quiz.ws.QuizWebSocketHandler;

/**
 * Registers the raw WebSocket endpoint {@code /ws/quiz} with the quiz auth
 * handshake interceptor, alongside (and independent of) the duel's
 * {@code /ws/duel} endpoint. Clients connect as
 * {@code /ws/quiz?token=<jwt>&roomCode=<code>&role=host|student&name=<nick>}.
 */
@Configuration
@EnableWebSocket
public class QuizWebSocketConfig implements WebSocketConfigurer {

    private final QuizWebSocketHandler handler;
    private final QuizAuthHandshakeInterceptor authInterceptor;

    public QuizWebSocketConfig(QuizWebSocketHandler handler, QuizAuthHandshakeInterceptor authInterceptor) {
        this.handler = handler;
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(handler, "/ws/quiz")
                .addInterceptors(authInterceptor)
                .setAllowedOriginPatterns("*");
    }
}

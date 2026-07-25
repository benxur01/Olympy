package uz.olympy.duel.service;

import java.util.List;

import org.springframework.stereotype.Component;

import uz.olympy.duel.model.Question;

/**
 * Hardcoded sample question set for v1. Sourcing questions from Django's
 * question bank (by subject/difficulty) is a deliberate follow-up.
 */
@Component
public class QuestionBank {

    private static final List<Question> QUESTIONS = List.of(
            new Question(1, "2 + 2 * 2 = ?", List.of("6", "8", "4", "10"), 0),
            new Question(2, "Suvning kimyoviy formulasi?", List.of("CO2", "O2", "H2O", "NaCl"), 2),
            new Question(3, "O'zbekiston poytaxti?", List.of("Samarqand", "Toshkent", "Buxoro", "Xiva"), 1),
            new Question(4, "12 * 12 = ?", List.of("124", "144", "122", "154"), 1),
            new Question(5, "Quyoshga eng yaqin sayyora?", List.of("Venera", "Mars", "Merkuriy", "Yer"), 2)
    );

    public List<Question> forSubject(String subject) {
        // v1: subject ignored; same fixed set for everyone.
        return QUESTIONS;
    }
}

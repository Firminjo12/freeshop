# Freeshop — gestion des encaissements

Application en français pour créer et suivre les demandes d’encaissement TFC PAY, consulter les consignes Mobile Money, actualiser les statuts, filtrer les opérations et exporter un CSV.

## Démarrer sans terminal

Ouvre le fichier **Freeshop.desktop** depuis le gestionnaire de fichiers. Il lance le serveur local en arrière-plan et ouvre l’application dans le navigateur. Node.js est déjà installé sur cet ordinateur. La page écoute uniquement sur `127.0.0.1` ; elle n’est pas accessible aux autres appareils du réseau.

Sans clé configurée, l’application s’ouvre en démonstration. Les exemples sont fictifs et aucune requête de paiement n’est envoyée. Les demandes de démonstration sont gardées dans le stockage local du navigateur.

## Connecter le bac à sable TFC PAY

1. Dans l’application, ouvre l’icône ⚙ et saisis une clé API `sk_test_…` ou `sk_live_…`. La clé est enregistrée dans le fichier local `.env` et n’est jamais renvoyée au navigateur après enregistrement. Le mode LIVE crée des demandes réelles; vérifie l’accès de production, le KYC et la permission `collect:write` avant de l’utiliser.
2. Vérifie que l’application TFC PAY possède un wallet XOF et qu’un compte opérateur de collecte lui est affecté. Sans cela, la documentation indique que la création répond notamment `no_sim_assigned` ou `wallet_not_found`.
3. Pour les confirmations automatiques, crée un endpoint webhook dans la console TFC PAY avec les événements `payment_intent.settled`, `payment_intent.amount_mismatch` et `payment_intent.cancelled`. Enregistre le secret `whsec_…` affiché une seule fois dans ⚙. L’application vérifie la signature HMAC, l’horodatage, les doublons d’événements et leur séquence.
4. TFC PAY doit pouvoir joindre l’URL de notification. Pour un poste local, utilise un tunnel HTTPS vers `http://127.0.0.1:8787/api/tfc/webhook` si nécessaire. La documentation TFC PAY autorise aussi `http://localhost` en bac à sable ; HTTPS est obligatoire en réel.

L’application utilise `https://tcf-pay.infra.dongobada.com` par défaut, l’adresse affichée dans le profil TFC PAY. Elle envoie les montants XOF comme des nombres entiers et crée une clé d’idempotence par demande pour éviter les doublons en cas de reprise. Un paiement n’est affiché comme réussi qu’après un statut confirmé (`settled`) de l’API ou du webhook. Les statistiques mensuelles sont lues depuis la route officielle TFC PAY.

## Données et secrets

Les secrets sont enregistrés dans `.env`, exclu de Git et protégé par les permissions du fichier. Les demandes et événements webhook sont stockés dans `data/store.json`, également exclu de Git. Ces fichiers restent sur cet ordinateur.

L’application ne demande pas de mot de passe administrateur. Toute personne disposant de son URL peut consulter et utiliser les fonctions de gestion ; ne publie pas l’URL si l’accès doit rester privé. La variable `FREESHOP_PASSWORD` n’est plus utilisée.

La clé de test est recommandée pour la recette. L’application peut aussi recevoir une clé LIVE si TFC PAY a validé le compte et les autorisations requises. Aucun paiement LIVE n’a été essayé.

workspace {
    model {
        archetypes {
            application = container {
                technology "Java"
                tag "Application"
            }
            springBoot = application {
                technology "Spring Boot"
                tags "Spring Boot,Framework"
                properties {
                    "team" "core"
                }
            }
            softwaresystem {
                description "Default description"
                tag "Default"
            }
            datastore = container {
                tags "Database"
            }
            https = -> {
                technology "HTTPS"
                tag "Secure"
            }
            mtls = --https-> {
                tags "mTLS"
            }
            external = softwareSystem {
                tag "External"
            }
            team = group
        }
        a = softwareSystem "A" {
            api = springBoot "API" "Serves" "Kotlin"
            db = datastore "DB" {
                technology "Postgres"
            }
            web = application "Web"
        }
        b = external "B" "Has its own description"
        team "Teams" {
            c = softwareSystem "C"
        }
        api --https-> b "Calls"
        web --mtls-> api "Uses"
        api -> db
    }
}

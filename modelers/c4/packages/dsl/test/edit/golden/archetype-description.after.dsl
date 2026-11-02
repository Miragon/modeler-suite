workspace {
    model {
        archetypes {
            application = container {
                technology "Java"
                description "An application."
            }
        }
        shop = softwareSystem "Shop" {
            web = application "Web" "An application." "Kotlin"
        }
    }
}

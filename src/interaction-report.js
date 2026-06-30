import { execFile } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { DEFAULT_SITE } from "./config.js";
import { PublisherError } from "./errors.js";
import { relativeAssetHref, reportRelativePaths } from "./paths.js";
import {
  cleanGithubTrendDescription,
  cleanProjectDescription,
  githubTrendStatusHighlightTag,
  projectHeatTags
} from "./presentation.js";
import { defaultImportanceForSection, importanceLabel, importanceTag, normalizeImportance } from "./importance.js";
import { CACHED_DOMAIN_ICONS, CACHED_SOURCE_ICONS } from "./source-icon-cache.js";
import { platformForSection, platformItemLabel, PLATFORM_SECTIONS } from "./platform-exempt.js";
import { resolveLinkIcon } from "./link-icons.js";
import {
  hasInvalidOfficialTrackingSnapshot,
  trackingComponentForInteraction
} from "./tracking-components.js";
import { normalizeStoryFirstReport, readerFacingStoryTitle } from "./story-first.js";
import {
  buildSourceInventoryRows,
  decorateSourceEffectivenessRows,
  sourceFirstPresentationContract,
  sourceFirstPresentationRichIds
} from "./source-effectiveness.js";

const execFileAsync = promisify(execFile);
const HUGGING_FACE_ICON =
  "data:image/svg+xml;base64," +
  "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NSIgaGVpZ2h0PSI4OCIgZmlsbD0ibm9uZSI+PHBhdGggZmlsbD0iI0ZGRDIxRSIgZD0iTTQ3LjIxIDc2LjVhMzQuNzUgMzQuNzUgMCAxIDAgMC02OS41IDM0Ljc1IDM0Ljc1IDAgMCAwIDAgNjkuNVoiIC8+PHBhdGggZmlsbD0iI0ZGOUQwQiIgZD0iTTgxLjk2IDQxLjc1YTM0Ljc1IDM0Ljc1IDAgMSAwLTY5LjUgMCAzNC43NSAzNC43NSAwIDAgMCA2OS41IDBabS03My41IDBhMzguNzUgMzguNzUgMCAxIDEgNzcuNSAwIDM4Ljc1IDM4Ljc1IDAgMCAxLTc3LjUgMFoiIC8+PHBhdGggZmlsbD0iIzNBM0I0NSIgZD0iTTU4LjUgMzIuM2MxLjI4LjQ0IDEuNzggMy4wNiAzLjA3IDIuMzhhNSA1IDAgMSAwLTYuNzYtMi4wN2MuNjEgMS4xNSAyLjU1LS43MiAzLjctLjMyWk0zNC45NSAzMi4zYy0xLjI4LjQ0LTEuNzkgMy4wNi0zLjA3IDIuMzhhNSA1IDAgMSAxIDYuNzYtMi4wN2MtLjYxIDEuMTUtMi41Ni0uNzItMy43LS4zMloiIC8+PHBhdGggZmlsbD0iI0ZGMzIzRCIgZD0iTTQ2Ljk2IDU2LjI5YzkuODMgMCAxMy04Ljc2IDEzLTEzLjI2IDAtMi4zNC0xLjU3LTEuNi00LjA5LS4zNi0yLjMzIDEuMTUtNS40NiAyLjc0LTguOSAyLjc0LTcuMTkgMC0xMy02Ljg4LTEzLTIuMzhzMy4xNiAxMy4yNiAxMyAxMy4yNloiIC8+PHBhdGggZmlsbD0iIzNBM0I0NSIgZmlsbC1ydWxlPSJldmVub2RkIiBkPSJNMzkuNDMgNTRhOC43IDguNyAwIDAgMSA1LjMtNC40OWMuNC0uMTIuODEuNTcgMS4yNCAxLjI4LjQuNjguODIgMS4zNyAxLjI0IDEuMzcuNDUgMCAuOS0uNjggMS4zMy0xLjM1LjQ1LS43Ljg5LTEuMzggMS4zMi0xLjI1YTguNjEgOC42MSAwIDAgMSA1IDQuMTdjMy43My0yLjk0IDUuMS03Ljc0IDUuMS0xMC43IDAtMi4zNC0xLjU3LTEuNi00LjA5LS4zNmwtLjE0LjA3Yy0yLjMxIDEuMTUtNS4zOSAyLjY3LTguNzcgMi42N3MtNi40NS0xLjUyLTguNzctMi42N2MtMi42LTEuMjktNC4yMy0yLjEtNC4yMy4yOSAwIDMuMDUgMS40NiA4LjA2IDUuNDcgMTAuOTdaIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIC8+PHBhdGggZmlsbD0iI0ZGOUQwQiIgZD0iTTcwLjcxIDM3YTMuMjUgMy4yNSAwIDEgMCAwLTYuNSAzLjI1IDMuMjUgMCAwIDAgMCA2LjVaTTI0LjIxIDM3YTMuMjUgMy4yNSAwIDEgMCAwLTYuNSAzLjI1IDMuMjUgMCAwIDAgMCA2LjVaTTE3LjUyIDQ4Yy0xLjYyIDAtMy4wNi42Ni00LjA3IDEuODdhNS45NyA1Ljk3IDAgMCAwLTEuMzMgMy43NiA3LjEgNy4xIDAgMCAwLTEuOTQtLjNjLTEuNTUgMC0yLjk1LjU5LTMuOTQgMS42NmE1LjggNS44IDAgMCAwLS44IDcgNS4zIDUuMyAwIDAgMC0xLjc5IDIuODJjLS4yNC45LS40OCAyLjguOCA0Ljc0YTUuMjIgNS4yMiAwIDAgMC0uMzcgNS4wMmMxLjAyIDIuMzIgMy41NyA0LjE0IDguNTIgNi4xIDMuMDcgMS4yMiA1Ljg5IDIgNS45MSAyLjAxYTQ0LjMzIDQ0LjMzIDAgMCAwIDEwLjkzIDEuNmM1Ljg2IDAgMTAuMDUtMS44IDEyLjQ2LTUuMzQgMy44OC01LjY5IDMuMzMtMTAuOS0xLjctMTUuOTItMi43Ny0yLjc4LTQuNjItNi44Ny01LTcuNzctLjc4LTIuNjYtMi44NC01LjYyLTYuMjUtNS42MmE1LjcgNS43IDAgMCAwLTQuNiAyLjQ2Yy0xLTEuMjYtMS45OC0yLjI1LTIuODYtMi44MkE3LjQgNy40IDAgMCAwIDE3LjUyIDQ4Wm0wIDRjLjUxIDAgMS4xNC4yMiAxLjgyLjY1IDIuMTQgMS4zNiA2LjI1IDguNDMgNy43NiAxMS4xOC41LjkyIDEuMzcgMS4zMSAyLjE0IDEuMzEgMS41NSAwIDIuNzUtMS41My4xNS0zLjQ4LTMuOTItMi45My0yLjU1LTcuNzItLjY4LTguMDEuMDgtLjAyLjE3LS4wMi4yNC0uMDIgMS43IDAgMi40NSAyLjkzIDIuNDUgMi45M3MyLjIgNS41MiA1Ljk4IDkuM2MzLjc3IDMuNzcgMy45NyA2LjggMS4yMiAxMC44My0xLjg4IDIuNzUtNS40NyAzLjU4LTkuMTYgMy41OC0zLjgxIDAtNy43My0uOS05LjkyLTEuNDYtLjExLS4wMy0xMy40NS0zLjgtMTEuNzYtNyAuMjgtLjU0Ljc1LS43NiAxLjM0LS43NiAyLjM4IDAgNi43IDMuNTQgOC41NyAzLjU0LjQxIDAgLjctLjE3LjgzLS42Ljc5LTIuODUtMTIuMDYtNC4wNS0xMC45OC04LjE3LjItLjczLjcxLTEuMDIgMS40NC0xLjAyIDMuMTQgMCAxMC4yIDUuNTMgMTEuNjggNS41My4xMSAwIC4yLS4wMy4yNC0uMS43NC0xLjIuMzMtMi4wNC00LjktNS4yLTUuMjEtMy4xNi04Ljg4LTUuMDYtNi44LTcuMzMuMjQtLjI2LjU4LS4zOCAxLS4zOCAzLjE3IDAgMTAuNjYgNi44MiAxMC42NiA2LjgyczIuMDIgMi4xIDMuMjUgMi4xYy4yOCAwIC41Mi0uMS42OC0uMzguODYtMS40Ni04LjA2LTguMjItOC41Ni0xMS4wMS0uMzQtMS45LjI0LTIuODUgMS4zMS0yLjg1WiIgLz48cGF0aCBmaWxsPSIjRkZEMjFFIiBkPSJNMzguNiA3Ni42OWMyLjc1LTQuMDQgMi41NS03LjA3LTEuMjItMTAuODQtMy43OC0zLjc3LTUuOTgtOS4zLTUuOTgtOS4zcy0uODItMy4yLTIuNjktMi45Yy0xLjg3LjMtMy4yNCA1LjA4LjY4IDguMDEgMy45MSAyLjkzLS43OCA0LjkyLTIuMjkgMi4xNy0xLjUtMi43NS01LjYyLTkuODItNy43Ni0xMS4xOC0yLjEzLTEuMzUtMy42My0uNi0zLjEzIDIuMi41IDIuNzkgOS40MyA5LjU1IDguNTYgMTEtLjg3IDEuNDctMy45My0xLjcxLTMuOTMtMS43MXMtOS41Ny04LjcxLTExLjY2LTYuNDRjLTIuMDggMi4yNyAxLjU5IDQuMTcgNi44IDcuMzMgNS4yMyAzLjE2IDUuNjQgNCA0LjkgNS4yLS43NSAxLjItMTIuMjgtOC41My0xMy4zNi00LjQtMS4wOCA0LjExIDExLjc3IDUuMyAxMC45OCA4LjE1LS44IDIuODUtOS4wNi01LjM4LTEwLjc0LTIuMTgtMS43IDMuMjEgMTEuNjUgNi45OCAxMS43NiA3LjAxIDQuMyAxLjEyIDE1LjI1IDMuNDkgMTkuMDgtMi4xMloiIC8+PHBhdGggZmlsbD0iI0ZGOUQwQiIgZD0iTTc3LjQgNDhjMS42MiAwIDMuMDcuNjYgNC4wNyAxLjg3YTUuOTcgNS45NyAwIDAgMSAxLjMzIDMuNzYgNy4xIDcuMSAwIDAgMSAxLjk1LS4zYzEuNTUgMCAyLjk1LjU5IDMuOTQgMS42NmE1LjggNS44IDAgMCAxIC44IDcgNS4zIDUuMyAwIDAgMSAxLjc4IDIuODJjLjI0LjkuNDggMi44LS44IDQuNzRhNS4yMiA1LjIyIDAgMCAxIC4zNyA1LjAyYy0xLjAyIDIuMzItMy41NyA0LjE0LTguNTEgNi4xLTMuMDggMS4yMi01LjkgMi01LjkyIDIuMDFhNDQuMzMgNDQuMzMgMCAwIDEtMTAuOTMgMS42Yy01Ljg2IDAtMTAuMDUtMS44LTEyLjQ2LTUuMzQtMy44OC01LjY5LTMuMzMtMTAuOSAxLjctMTUuOTIgMi43OC0yLjc4IDQuNjMtNi44NyA1LjAxLTcuNzcuNzgtMi42NiAyLjgzLTUuNjIgNi4yNC01LjYyYTUuNyA1LjcgMCAwIDEgNC42IDIuNDZjMS0xLjI2IDEuOTgtMi4yNSAyLjg3LTIuODJBNy40IDcuNCAwIDAgMSA3Ny40IDQ4Wm0wIDRjLS41MSAwLTEuMTMuMjItMS44Mi42NS0yLjEzIDEuMzYtNi4yNSA4LjQzLTcuNzYgMTEuMThhMi40MyAyLjQzIDAgMCAxLTIuMTQgMS4zMWMtMS41NCAwLTIuNzUtMS41My0uMTQtMy40OCAzLjkxLTIuOTMgMi41NC03LjcyLjY3LTguMDFhMS41NCAxLjU0IDAgMCAwLS4yNC0uMDJjLTEuNyAwLTIuNDUgMi45My0yLjQ1IDIuOTNzLTIuMiA1LjUyLTUuOTcgOS4zYy0zLjc4IDMuNzctMy45OCA2LjgtMS4yMiAxMC44MyAxLjg3IDIuNzUgNS40NyAzLjU4IDkuMTUgMy41OCAzLjgyIDAgNy43My0uOSA5LjkzLTEuNDYuMS0uMDMgMTMuNDUtMy44IDExLjc2LTctLjI5LS41NC0uNzUtLjc2LTEuMzQtLjc2LTIuMzggMC02LjcxIDMuNTQtOC41NyAzLjU0LS40MiAwLS43MS0uMTctLjgzLS42LS44LTIuODUgMTIuMDUtNC4wNSAxMC45Ny04LjE3LS4xOS0uNzMtLjctMS4wMi0xLjQ0LTEuMDItMy4xNCAwLTEwLjIgNS41My0xMS42OCA1LjUzLS4xIDAtLjE5LS4wMy0uMjMtLjEtLjc0LTEuMi0uMzQtMi4wNCA0Ljg4LTUuMiA1LjIzLTMuMTYgOC45LTUuMDYgNi44LTcuMzMtLjIzLS4yNi0uNTctLjM4LS45OC0uMzgtMy4xOCAwLTEwLjY3IDYuODItMTAuNjcgNi44MnMtMi4wMiAyLjEtMy4yNCAyLjFhLjc0Ljc0IDAgMCAxLS42OC0uMzhjLS44Ny0xLjQ2IDguMDUtOC4yMiA4LjU1LTExLjAxLjM0LTEuOS0uMjQtMi44NS0xLjMxLTIuODVaIiAvPjxwYXRoIGZpbGw9IiNGRkQyMUUiIGQ9Ik01Ni4zMyA3Ni42OWMtMi43NS00LjA0LTIuNTYtNy4wNyAxLjIyLTEwLjg0IDMuNzctMy43NyA1Ljk3LTkuMyA1Ljk3LTkuM3MuODItMy4yIDIuNy0yLjljMS44Ni4zIDMuMjMgNS4wOC0uNjggOC4wMS0zLjkyIDIuOTMuNzggNC45MiAyLjI4IDIuMTcgMS41MS0yLjc1IDUuNjMtOS44MiA3Ljc2LTExLjE4IDIuMTMtMS4zNSAzLjY0LS42IDMuMTMgMi4yLS41IDIuNzktOS40MiA5LjU1LTguNTUgMTEgLjg2IDEuNDcgMy45Mi0xLjcxIDMuOTItMS43MXM5LjU4LTguNzEgMTEuNjYtNi40NGMyLjA4IDIuMjctMS41OCA0LjE3LTYuOCA3LjMzLTUuMjMgMy4xNi01LjYzIDQtNC45IDUuMi43NSAxLjIgMTIuMjgtOC41MyAxMy4zNi00LjQgMS4wOCA0LjExLTExLjc2IDUuMy0xMC45NyA4LjE1LjggMi44NSA5LjA1LTUuMzggMTAuNzQtMi4xOCAxLjY5IDMuMjEtMTEuNjUgNi45OC0xMS43NiA3LjAxLTQuMzEgMS4xMi0xNS4yNiAzLjQ5LTE5LjA4LTIuMTJaIiAvPjwvc3ZnPg==";

const OPENAI_STATUS_ICON =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAACHFBMVEVMaXH////////////////////+/v7////////////////////////////////////+/v7////////////+/v7+/v7////////////////////////////////////////////+/v7////////////+/v79/f38/Pz7+/sAAAD4+Pj6+vq/v7/U1NQFBQVmZmb09PTx8fHr6+v5+fnW1tZcXFwWFhYPDw8wMDAaGhqGhoZXV1fFxcU9PT2mpqYtLS3h4eFra2szMzNGRkbs7OwGBgYZGRn29va2trYpKSkuLi5dXV0YGBheXl42NjaHh4ciIiJsbGwlJSWdnZ1oaGjv7+/Hx8c/Pz9PT08yMjKXl5csLCxYWFiNjY2Dg4McHBxDQ0O+vr7V1dWAgIADAwPf3986OjpZWVnk5ORvb28VFRV1dXUeHh5ISEhkZGSLi4uBgYGFhYWxsbGnp6cODg53d3cqKirl5eVfX19QUFDGxsbDw8OCgoISEhJ/f3/e3t719fUQEBAvLy9AQEARERGqqqqIiIgbGxu0tLQnJye1tbXn5+fm5uakpKQ8PDwmJiZtbW1iYmLS0tIICAgJCQkkJCQgICAEBAQ+Pj68vLwoKCibm5sUFBQNDQ0xMTHg4OCcnJxHR0ezs7OgoKDu7u4dHR3ExMTd3d3CwsJMTEzt7e0HBwfJycmioqJNTU1jY2PKysrIyMgXFxcTExM406YOAAAAJHRSTlMAASzMAwL8/f77DYyem9DoKef5MPbtX+wYzl7wG+s3jQw4nZzRy0erAAAACXBIWXMAAAsTAAALEwEAmpwYAAACwElEQVR4nH1TZVcjQRAcYpsQ3IJrze7GBUgCBHd3d3d3PXd3d3f7g/dmFw74cv1l39uprumpriJEKj8VIdFRATGRHBcZExAVTYjKjxwptZooAuKghVRaxKUq2L9/pSL+SWEAp+MopA8Qpk8mqsPzkCBwGi0VBF7kJQ4Nh6CQA4SKJAZDpwVl7QAviCIPrQ7BKTJCTRSh0AAU5ryeYrtFRlFoEKogakL8iL+SnfMo6Kypnpydahzs7cpgdBoo/YkfURM9dKzfkZ8pgseqcaausrTDBQod9IwiPAJa0HQMXweFz5vVXA5+qCjfCapFRDghJJAR8LDee4P1DVuLC6ZWwNxdCAE6BBISnwAthdn+wObDZlMGsP38zoIDeTXljCIhnsSCoxSZ97febSM3Gy9ant5cbrhwceKUFTw4xLIbBFR4Poju92jfe/LMWAuY6j1F7hPSmGlECU7AeA7e1nzEJ+PjJcvapQrgauaIRWJQEgNb0dgiWrN8eJjD3j9nfGUF6vtL2BAGwjENBqbh3G1mM5hMmPf++LIDVPVBBDgGENFXBezYbnnnGSA7F99WWjE9AMoABvbKkv7zwO1i4xy7IqcdP39/xuIYc4aBDQkelpHqK8DlG5WPXq8Zv6PtTwlyxiGwIdOgA8Wou2ql3gTUGj0v99rxazd91FMBgUkZKzFYz04sZTUsN7oLC9gMbWVtDZmglAklS32y7BwcC3frtoCMpk18LbXZzftSS8sSUHhaBJzpcLXYNtZxrYkJLS9LWjeFM79oiEd5c5bXB4ozw0inkNctG4bC1VFaWTdjXAUPobbbwTSQDbNvOUqR0dU72Dg1O1ld1lnALti33IFpqeR3WOzFPXlm1n9gWmb7FMn2vCgKMopSyfaJh8GQgyP5XeQFgR4PDkMk6+XosXY5ekn+h+dyeFOPhjfgeHj/F/+/Zvqm8OFp/WAAAAAASUVORK5CYII=";
const GITHUB_BLOG_ICON =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABqlBMVEVHcEwYGBgXFxcZFxcYFhYZGRkYFhYYFhYUFBQAAAAcHBwYFRUYFhYZFhYYFRUXFhYXFxcYFhYYFhYYFhYZFhYXFxcYFhYYFhYYFhYaGhoWFhYAAAAAAAAYFRUXFxcYFhYXFxcZFhYYFhYAAAAkJCQAAAAZFBQYFBQSEhIZFRUaFhYgEBAYFhYYFBQYFhYYFhYYFxcYFhYYFhYXFRUXFxcYFhYYFhYYFRUXFhYzAAAXFxcWFhYYFhYYFRUYFhYYGBgZFhYYFRUYFhYYFhYXFxcXFxcYFxcYFhYYFRUYFhYVFRUYFhYXFRUYFhYYFhYZFhYqAAAXFxcZFhYZFRUWFhYZFRUYFxcZFhYZFhYYFhYZFhYZGRkXFxcZFxcYFhYVFRUYFhYXFhYYFhYZFhYYFRUZFhYYFhYYFhYXFRUaFxceDw8YFRUYFhYVFRUZFRUWFhYXFxcYFhYYFhYQEBAaFhYTExMaGhoaGhoYFhYYFhYXFxcaFRUWFhYZFxcYFxcqKioaFBQXFxcYFRUWFhYYFhYYFxcaFBQYFhYYFhYYFRUXFhYaFhYZFhYYFhathGCcAAAAjXRSTlMAICxw/Cnt/hkCCVSxUbOkWfPj9GdD9mnTCiIBBUpa1Tem+wMHBDQ/DptGENtLq8L56qptC3OVSboFWC73a3YqXFbn7FdCqcdfagzBeKz52gZkaD4vSJJyup9HHy16+jB+5OldYa+49WNaEb+MJJAjb7aXEDsbHRT9ghY8Ony/BjIhp0TNkyfx3FX6Rc+4kjohAAABpElEQVQ4y22T5XvCQAzGM6DCYLDB3McGzN3d3d3d3d3d7n9eL6Vr6TVf3iS/9+lzd0kBNJFoyttKTuLSwTBKN9c3CEaEYyWUwaFzPNHE8sRgME8dILqIHdXyzn7CRLRN5ZECMQhLssKTLMQwCkdkLrZIhbPGnKuilC6TXZKlbTSk0VY4gNfcXm+Limrq7Yu0AsTQ7jHlC3iANv29w2jXcyBlUyTwheAYxva+9EIRmDXqDXXYLkqHaUwqmadN6ECQCouoY+xsWhEcgpOKEMcaRDSUwyQVt8F0E9GQDztU5hNYQzca1uAI9Yw1NCBIgyxUG2sYQrALZlQHayhAsAo+VKFCz6vlse2B1YXJR7ZuFNHyWKX0ipD7N54Iz36vQjOy7YG5l0nVtZu4Kr4+6TY7rRRXOWqVveAzaeNOeqj3skJ1pDH/i1OC9cMrIcViScFvfo5sMCm8xyo3noqI5aeUe7kJHCEkwF2icqhHnnyX592GZQQZmjn1Upy8sDlaQ2y89tqZWXQzL+Qinv4U4/oN8NkvhRM5nSGe4lmDBTg/VTK/qHb/AERH3u9xwIrQAAAAAElFTkSuQmCC";
const AI_DAILY_ICON = generatedDailyIcon();
const ARXIV_ICON = generatedSiteIcon("arXiv", "#b31b1b", "#ffffff");
const PUBLIC_BODY_SOURCE_PREFIX_RE = /^(?:\*\*)?[A-Z][A-Za-z0-9 .&+/’'()|-]{1,80}(?:Blog|Changelog|Press Releases|Investor Relations|Newsroom|News|Research|RSS|Feed|Status|Docs|Documentation|Release Notes|Company News|Keyword Blog|Model Card|Hugging Face|GitHub)(?:\*\*)?\s*[：:]\s*/u;
const PUBLIC_MEDIA_MIN_WIDTH = 240;
const PUBLIC_MEDIA_MIN_HEIGHT = 160;
const PUBLIC_MEDIA_MIN_AREA = 80000;
const NON_CONTENT_MEDIA_ROLES = new Set(["icon", "favicon", "logo", "avatar", "decorative"]);

const SOURCE_ICONS = new Map([
  ...Object.entries(CACHED_SOURCE_ICONS),
  ["arXiv", ARXIV_ICON],
  ["arXiv cs.AI", ARXIV_ICON],
  ["OpenAI", OPENAI_STATUS_ICON],
  ["OpenAI News", OPENAI_STATUS_ICON],
  ["OpenAI News RSS", OPENAI_STATUS_ICON],
  ["OpenAI Status", OPENAI_STATUS_ICON],
  ["GitHub", GITHUB_BLOG_ICON],
  ["GitHub Changelog", GITHUB_BLOG_ICON],
  ["GitHub Trending", GITHUB_BLOG_ICON],
  ["GitHub Trending daily", GITHUB_BLOG_ICON],
  ["GitHub Trending weekly", GITHUB_BLOG_ICON],
  ["AWS What's New", generatedSiteIcon("AWS", "#232f3e", "#ff9900")],
  ["AWS Machine Learning Blog", generatedSiteIcon("AWS", "#232f3e", "#ff9900")],
  ["AWS for SAP Blog", generatedSiteIcon("AWS", "#232f3e", "#ff9900")],
  ["Anthropic", generatedSiteIcon("A", "#111111", "#d8c4a5")],
  ["Anthropic Research", generatedSiteIcon("A", "#111111", "#d8c4a5")],
  ["Claude Status", generatedSiteIcon("C", "#111111", "#d8c4a5")],
  ["Mistral AI", generatedSiteIcon("M", "#ff7000", "#ffffff")],
  ["Mistral Docs", generatedSiteIcon("M", "#ff7000", "#ffffff")],
  ["Microsoft", generatedSiteIcon("MS", "#5e5e5e", "#ffffff")],
  ["Microsoft Foundry Blog", generatedSiteIcon("MS", "#5e5e5e", "#ffffff")],
  ["Microsoft Research Blog", generatedSiteIcon("MS", "#5e5e5e", "#ffffff")],
  ["MiniMax Blog", generatedSiteIcon("MM", "#2563eb", "#ffffff")],
  ["MiniMax model page", generatedSiteIcon("MM", "#2563eb", "#ffffff")],
  ["NVIDIA", generatedSiteIcon("NV", "#76b900", "#111827")],
  ["NVIDIA Developer Blog", generatedSiteIcon("NV", "#76b900", "#111827")],
  ["Hugging Face Blog / NVIDIA", generatedSiteIcon("HF", "#ffd21e", "#3a3b45")],
  ["Alibaba Cloud Blog", generatedSiteIcon("AC", "#ff6a00", "#ffffff")],
  ["Vercel", generatedSiteIcon("V", "#000000", "#ffffff")],
  ["Guillermo Rauch X status", generatedSiteIcon("X", "#111111", "#ffffff")],
  ["Nature Communications", generatedSiteIcon("N", "#0f172a", "#ffffff")],
  ["Claude official X", generatedSiteIcon("X", "#111111", "#ffffff")],
  ["Simon Willison Weblog", generatedSiteIcon("SW", "#2f6f9f", "#ffffff")],
  ["AI & I / Every", generatedSiteIcon("E", "#111827", "#f7f1e8")],
  ["OpenRouter Rankings", CACHED_SOURCE_ICONS["OpenRouter Rankings"] || generatedSiteIcon("OR", "#111827", "#f97316")],
  ["Artificial Analysis Intelligence Index", generatedSiteIcon("AA", "#0f172a", "#38bdf8")],
  ["Scale Labs SWE-Bench Pro", generatedSiteIcon("SB", "#111827", "#84cc16")]
]);

const DOMAIN_ICONS = new Map([
  ...Object.entries(CACHED_DOMAIN_ICONS),
  ["openai.com", OPENAI_STATUS_ICON],
  ["status.openai.com", OPENAI_STATUS_ICON],
  ["github.com", GITHUB_BLOG_ICON],
  ["github.blog", GITHUB_BLOG_ICON],
  ["raw.githubusercontent.com", GITHUB_BLOG_ICON],
  ["arxiv.org", ARXIV_ICON],
  ["export.arxiv.org", ARXIV_ICON],
  ["huggingface.co", HUGGING_FACE_ICON],
  ["aws.amazon.com", SOURCE_ICONS.get("AWS What's New")],
  ["amazon.com", SOURCE_ICONS.get("AWS What's New")],
  ["microsoft.com", SOURCE_ICONS.get("Microsoft")],
  ["devblogs.microsoft.com", SOURCE_ICONS.get("Microsoft Foundry Blog")],
  ["minimax.io", SOURCE_ICONS.get("MiniMax model page")],
  ["developer.nvidia.com", SOURCE_ICONS.get("NVIDIA Developer Blog")],
  ["nvidia.com", SOURCE_ICONS.get("NVIDIA")],
  ["alibabacloud.com", SOURCE_ICONS.get("Alibaba Cloud Blog")],
  ["vercel.com", SOURCE_ICONS.get("Vercel")],
  ["nature.com", SOURCE_ICONS.get("Nature Communications")],
  ["status.claude.com", SOURCE_ICONS.get("Claude Status")],
  ["claude.com", SOURCE_ICONS.get("Claude Status")],
  ["anthropic.com", SOURCE_ICONS.get("Anthropic")],
  ["mistral.ai", SOURCE_ICONS.get("Mistral AI")],
  ["x.com", SOURCE_ICONS.get("Claude official X")],
  ["twitter.com", SOURCE_ICONS.get("Claude official X")],
  ["simonwillison.net", SOURCE_ICONS.get("Simon Willison Weblog")],
  ["every.to", SOURCE_ICONS.get("AI & I / Every")],
  ["openrouter.ai", SOURCE_ICONS.get("OpenRouter Rankings")],
  ["artificialanalysis.ai", SOURCE_ICONS.get("Artificial Analysis Intelligence Index")],
  ["scale.com", SOURCE_ICONS.get("Scale Labs SWE-Bench Pro")],
  ["labs.scale.com", SOURCE_ICONS.get("Scale Labs SWE-Bench Pro")]
]);

for (const [source, icon] of Object.entries(CACHED_SOURCE_ICONS)) {
  SOURCE_ICONS.set(source, icon);
}

for (const [domain, icon] of Object.entries(CACHED_DOMAIN_ICONS)) {
  DOMAIN_ICONS.set(domain, icon);
}

export function reportToInteractionInput(report, options = {}) {
  const rawReport = report && typeof report === "object" ? report : {};
  const rawMainItems = Array.isArray(rawReport.main_items) ? rawReport.main_items : [];
  report = normalizeStoryFirstReport(report);
  const includeInternalSections = options.includeInternalSections === true;
  const includeSourceFirstRuntimeSections = options.includeSourceFirstRuntimeSections === true;
  const mediaOptions = {
    assetRootDir: options.assetRootDir || options.outDir || ""
  };
  const mainItems = Array.isArray(report.main_items) ? report.main_items : [];
  const stories = Array.isArray(report.stories) ? report.stories : [];
  const hotBlogs = Array.isArray(report.hot_blogs) ? report.hot_blogs : [];
  const chineseMediaDynamics = Array.isArray(report.chinese_media_dynamics) ? report.chinese_media_dynamics : [];
  const dailyTracking = Array.isArray(report.daily_tracking) ? report.daily_tracking : [];
  const publicDailyTracking = dailyTracking.filter(isPublicDailyTrackingChange);
  const githubTrending = Array.isArray(report.github_trending) ? report.github_trending : [];
  const huggingFaceTrending = Array.isArray(report.huggingface_trending) ? report.huggingface_trending : [];
  const projects = Array.isArray(report.projects) ? report.projects : [];
  const builderObservations = Array.isArray(report.builder_observations) ? report.builder_observations : [];
  const officialOrgUpdates = Array.isArray(report.official_org_updates) ? report.official_org_updates : [];
  const communityLeads = Array.isArray(report.community_leads) ? report.community_leads : [];
  const sourceEffectivenessRows = includeSourceFirstRuntimeSections ? sourceFirstRows(report.source_effectiveness) : [];
  const sourceFirstPresentation = includeSourceFirstRuntimeSections
    ? sourceFirstPresentationContract(options.sourceFirstPresentationContract)
    : undefined;
  const sourceFirstRuntimeSectionOrder = sourceFirstPresentation
    ? sourceFirstPresentationRichIds(sourceFirstPresentation)
    : [];
  const sourceInventoryRows = sourceEffectivenessRows.length > 0
    ? sourceInventoryRowsWithRuntime(
      buildSourceInventoryRows({ rootDir: options.rootDir || process.cwd() }),
      sourceEffectivenessRows
    )
    : [];
  const platformItems = Object.fromEntries(
    PLATFORM_SECTIONS.map((sectionName) => [sectionName, Array.isArray(report[sectionName]) ? report[sectionName] : []])
  );
  const evidenceAssets = Array.isArray(report.evidence_assets) ? report.evidence_assets : [];
  const evidenceByUrl = evidenceAssetsBySourceUrl(evidenceAssets);
  const paths = reportRelativePaths(report.report_date);
  const dataHref = publicAssetUrl(report, paths.dataPath);
  const indexHref = publicAssetUrl(report, "index.html");
  const trendAnnotations = normalizeTrendAnnotations(options.trendAnnotations);
  const dateIndexItem = options.dateIndexItem && typeof options.dateIndexItem === "object" ? options.dateIndexItem : null;
  const reportNavigation = options.reportNavigation && typeof options.reportNavigation === "object" ? options.reportNavigation : null;
  const dailyOverviewStats = [
    ...dateIndexHeroStats(dateIndexItem),
    ...dailyHeroStats(report, {
      mainItems,
      hotBlogs,
      dailyTracking: publicDailyTracking,
      githubTrending,
      projects,
      builderObservations,
      communityLeads,
      sourceEffectiveness: sourceEffectivenessRows
    })
  ];
  const sections = [];
  if (includeSourceFirstRuntimeSections) {
    const sourceFirstRuntimeSections = formatSourceFirstRuntimeSections({
      presentation: sourceFirstPresentation,
      sourceEffectivenessRows,
      sourceInventoryRows,
      stories,
      mainItems
    });
    const systemOperatingDashboard = formatSystemOperatingDashboardSection(report, {
      stories,
      mainItems: rawMainItems.length > 0 ? rawMainItems : mainItems,
      hotBlogs,
      chineseMediaDynamics,
      dailyTracking: publicDailyTracking,
      githubTrending,
      huggingFaceTrending,
      builderObservations,
      officialOrgUpdates,
      communityLeads,
      sourceEffectivenessRows,
      sourceInventoryRows
    });
    if (systemOperatingDashboard) {
      const sourceDashboardIndex = sourceFirstRuntimeSections.findIndex((section) => section?.richId === "source-first-dashboard");
      sourceFirstRuntimeSections.splice(
        sourceDashboardIndex >= 0 ? sourceDashboardIndex + 1 : sourceFirstRuntimeSections.length,
        0,
        systemOperatingDashboard
      );
    }
    sections.push(...sourceFirstRuntimeSections);
  }
  sections.push(...formatStoryFirstSections(stories, {
    report,
    evidenceByUrl,
    trendAnnotations,
    storyById: storyIndexById(stories),
    mediaOptions
  }));

  if (publicDailyTracking.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "每日追踪",
      group: "signals",
      cardClass: "tracking-card",
      showFilters: false,
      items: formatDailyTrackingCards(publicDailyTracking, { report, evidenceByUrl, mediaOptions })
    });
  }
  if (hotBlogs.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "精选博客更新",
      group: "main",
      cardClass: "blog-card",
      filterLabel: "博客主题筛选",
      showFilters: false,
      items: formatHotBlogCards(hotBlogs, { report, evidenceByUrl, mediaOptions })
    });
  }
  if (chineseMediaDynamics.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "中文媒体动态",
      group: "main",
      cardClass: "blog-card chinese-media-card",
      showFilters: false,
      items: formatHotBlogCards(chineseMediaDynamics, { report, evidenceByUrl, mediaOptions })
    });
  }
  if (githubTrending.length > 0) {
    sections.push({
      type: "markdown",
          title: "GitHub Trending · Top 8",
          group: "projects",
          content: formatGithubTrending(githubTrending, { trendAnnotations, projects })
        });
  }
  if (huggingFaceTrending.length > 0) {
    sections.push({
      type: "markdown",
      title: "Hugging Face Trending 路 Top 10",
      group: "projects",
      content: formatHuggingFaceTrending(huggingFaceTrending, { trendAnnotations })
    });
  }
  if (officialOrgUpdates.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "官方组织动态",
      group: "signals",
      cardClass: "official-card",
      showFilters: false,
      items: formatOfficialOrgUpdateCards(officialOrgUpdates, { report, evidenceByUrl, mediaOptions })
    });
  }
  if (builderObservations.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "X/Twitter 讨论",
      group: "signals",
      cardClass: "builder-card",
      showFilters: false,
      items: formatBuilderObservationCards(builderObservations, report, { mediaOptions })
    });
  }
  const twitterDegradation = builderObservations.length === 0
    ? formatTwitterDiscussion(builderObservations, report.source_audit?.builder_sources)
    : "";
  if (twitterDegradation) {
    sections.push({
      type: "markdown",
      title: "X/Twitter 讨论",
      group: "signals",
      content: twitterDegradation
    });
  }
  const communityCards = formatCommunityLeadCards(communityLeads, { report, evidenceByUrl, mediaOptions });
  if (communityCards.length > 0) {
    sections.push({
      type: "filterable-cards",
      title: "社区线索",
      group: "signals",
      cardClass: "community-card",
      showFilters: false,
      items: communityCards
    });
  }
  for (const sectionName of PLATFORM_SECTIONS) {
    const cards = formatPlatformExemptCards(platformItems[sectionName], sectionName, { report, evidenceByUrl, mediaOptions });
    if (cards.length === 0) {
      continue;
    }
    sections.push({
      type: "filterable-cards",
      title: platformItemLabel(platformForSection(sectionName)),
      group: "signals",
      cardClass: "platform-card",
      showFilters: false,
      items: cards
    });
  }
  const publicSourceCoverage = formatPublicSourceCoverageV2(report.source_audit);
  if (publicSourceCoverage) {
    sections.push({
      type: "markdown",
      title: "信源覆盖与缺口",
      group: "verification",
      content: publicSourceCoverage
    });
  }
  if (includeInternalSections) {
    const sourceAuditOverview = formatSourceAuditOverviewChart(report.source_audit, dataHref);
    if (sourceAuditOverview) {
      sections.push(sourceAuditOverview);
    }
    const qualityStatus = formatQualityStatus(report.quality_status);
    if (qualityStatus) {
      sections.push({
        type: "markdown",
        title: "发布质量说明",
        group: "verification",
        content: qualityStatus
      });
    }
    sections.push(
      {
        type: "markdown",
        title: "信源审计",
        group: "verification",
        appendix: true,
        appendixLabel: "附录",
        collapsed: true,
        summary: "来源、候选池和重试记录，默认折叠。",
        content: formatSourceAudit(report.source_audit)
      },
      {
        type: "markdown",
        title: "自检与产物",
        group: "verification",
        appendix: true,
        appendixLabel: "附录",
        collapsed: true,
        summary: "验证结果、结构化 JSON 和后续规则建议，默认折叠。",
        content: `${formatSelfCheck(report.self_check)}\n\n- ${markdownLink(dataHref, "结构化 JSON")}`
      }
    );
  }

  return {
    title: report.title,
    summary: dailyHeroSynopsis(report, { stories, mainItems, sourceEffectivenessRows }),
    heroMode: "daily-report",
    heroTitle: report.report_date,
    heroEyebrow: dailyHeroEyebrow(report),
    heroStats: dailyOverviewStats,
    heroLinks: [
      { label: "日报导航", href: indexHref, icon: AI_DAILY_ICON },
      { label: "结构化 JSON", href: dataHref, icon: siteIconForUrl(dataHref, "JSON") }
      , ...dailyAdjacentHeroLinks(report, { reportNavigation })
    ],
    hideNavigation: false,
    hideHeroSummary: false,
    status: "complete",
    template: "research-explainer",
    renderMode: "pre-rendered",
    generatedAt: report.generated_at,
    sourceFirstPresentationContract: sourceFirstPresentation,
    sourceFirstRuntimeSectionOrder,
    intent: {
      audience: "3-10 年经验的研发工程师与技术管理者",
      primaryQuestion: `${report.report_date} 有哪些值得跟进的 AI 产品、模型、工程工具和开源项目动态？`,
      decision: "只保留有可回源证据、与工程工作流相关、且通过日报自检的条目。",
      timeBudget: "3 分钟",
      artifactKind: "research",
      successCriteria: [
        "主体信息不强行凑数",
        "模型发布合入主体信息",
        "项目补充信息只合并到 GitHub Trending 条目内",
        "公开页不暴露内部信源审计",
        "结构化 JSON 可追溯"
      ],
      ...dailyIntent(report)
    },
    sections,
    nextActions: []
  };
}

function formatSourceFirstRuntimeSections({
  presentation,
  sourceEffectivenessRows = [],
  sourceInventoryRows = [],
  stories = [],
  mainItems = []
} = {}) {
  const factories = {
    source_signal_story: () => formatSourceSignalStorySection(sourceEffectivenessRows, { stories, mainItems, sourceInventoryRows }),
    source_first_dashboard: () => formatSourceFirstDashboardSection(sourceEffectivenessRows, { sourceInventoryRows }),
    source_status_focus: () => formatSourceStatusFocusSection(sourceEffectivenessRows),
    source_map: () => formatSourceMapSections(sourceEffectivenessRows),
    source_inventory: () => formatSourceInventorySections(sourceInventoryRows)
  };
  const sections = [];
  for (const sectionId of presentation.source_first_section_order) {
    const factory = factories[sectionId];
    if (!factory) {
      throw new Error(`unknown source-first presentation section id: ${sectionId}`);
    }
    const produced = factory();
    if (Array.isArray(produced)) {
      sections.push(...produced.filter(Boolean));
    } else if (produced) {
      sections.push(produced);
    }
  }
  return sections;
}

function sourceInventoryRowsWithRuntime(rows = [], sourceEffectivenessRows = []) {
  const runtimeById = new Map(
    (Array.isArray(sourceEffectivenessRows) ? sourceEffectivenessRows : [])
      .filter((row) => row?.id)
      .map((row) => [String(row.id), row])
  );
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const logicalSourceId = String(row?.logical_source_id || "");
    if (!logicalSourceId) {
      return {
        ...row,
        runtime_status_label: "collection_only",
        runtime_status_detail: "未归入逻辑源，仅展示采集入口配置"
      };
    }
    const runtime = runtimeById.get(logicalSourceId);
    if (!runtime) {
      return {
        ...row,
        runtime_status_label: "unreported",
        runtime_status_detail: "逻辑源未在今日状态表出现"
      };
    }
    return {
      ...row,
      runtime_status_label: String(runtime.status_label || "unknown"),
      runtime_status_detail: `继承逻辑源 ${runtime.name || row.logical_source_name || logicalSourceId}`
    };
  });
}

function sourceInventoryRuntimeMetrics(rows = []) {
  const metrics = {
    total: 0,
    known: 0,
    missing: 0,
    inherited: 0,
    unreported: 0,
    collectionOnly: 0,
    unknown: 0,
    included: 0,
    updatedNotSelected: 0,
    blocked: 0,
    skipped: 0,
    noRecentUpdate: 0,
    parsedNotCandidate: 0,
    labelCounts: {}
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    metrics.total += 1;
    const label = String(row?.runtime_status_label || "").trim();
    if (!label) {
      metrics.missing += 1;
      continue;
    }
    metrics.known += 1;
    metrics.labelCounts[label] = (metrics.labelCounts[label] || 0) + 1;
    if (label === "collection_only") {
      metrics.collectionOnly += 1;
    } else if (label === "unreported") {
      metrics.unreported += 1;
    } else if (label === "unknown") {
      metrics.unknown += 1;
    } else {
      metrics.inherited += 1;
    }
    if (label === "included") {
      metrics.included += 1;
    } else if (label === "updated_not_selected") {
      metrics.updatedNotSelected += 1;
    } else if (label === "blocked") {
      metrics.blocked += 1;
    } else if (label === "not_configured_or_skipped") {
      metrics.skipped += 1;
    } else if (label === "no_recent_update") {
      metrics.noRecentUpdate += 1;
    } else if (label === "parsed_not_candidate") {
      metrics.parsedNotCandidate += 1;
    }
  }
  return metrics;
}

function sourceInventoryRuntimeSummary(metrics = {}) {
  if (!metrics.total) {
    return "";
  }
  return `全量采集入口 ${metrics.total}，入口运行态可见 ${metrics.known}/${metrics.total}，继承逻辑状态 ${metrics.inherited}，未上报 ${metrics.unreported}，仅采集入口 ${metrics.collectionOnly}`;
}

function hostnameLabel(value) {
  try {
    return new URL(String(value || "")).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function editorialSummary(report) {
  const summary = String(report?.summary || "").trim();
  if (!isProcessStatusSummary(summary)) {
    return summary;
  }

  const highlights = Array.isArray(report?.hero_highlights) ? report.hero_highlights : [];
  const highlightSummary = highlights
    .slice(0, 3)
    .map((item) => {
      const title = stripPublicBodySourcePrefix(item?.title, item);
      const reason = stripPublicBodySourcePrefix(item?.reason, item);
      if (!title) return "";
      return reason ? `${title}：${reason}` : title;
    })
    .filter(Boolean)
    .join("；");
  if (highlightSummary) {
    return `今日主线：${highlightSummary}`;
  }

  const mainTitles = (Array.isArray(report?.main_items) ? report.main_items : [])
    .slice(0, 3)
    .map((item) => String(item?.title || "").trim())
    .filter(Boolean)
    .join("、");
  return mainTitles ? `今日主线围绕 ${mainTitles} 展开。` : summary;
}

function dailyHeroSynopsis(report, { stories = [], mainItems = [], sourceEffectivenessRows = [] } = {}) {
  const storyLine = editorialSummary(report);
  const sourceLine = sourceHeroSynopsis(sourceEffectivenessRows);
  if (!sourceLine) {
    return storyLine;
  }
  const normalizedStoryLine = String(storyLine || "").trim()
    || sourceSignalStoryTitles(stories, mainItems).join("；");
  return [normalizedStoryLine, sourceLine]
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

function sourceHeroSynopsis(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }
  const metrics = sourceFirstMetrics(rows);
  if (metrics.total === 0) {
    return "";
  }
  const validSignals = metrics.included + metrics.updatedNotSelected;
  const blockedNames = sourceSignalSourceNames(rows, (row) => row.status_label === "blocked", 2);
  const skippedNames = sourceSignalSourceNames(rows, (row) => row.status_label === "not_configured_or_skipped", 2);
  const gapNames = [...blockedNames, ...skippedNames];
  const gapSuffix = gapNames.length > 0 ? `；需关注 ${gapNames.join("、")}` : "";
  return `信源信号：有效信源 ${validSignals}/${metrics.total}；公开入选 ${metrics.included}/${metrics.total}；有更新未入选 ${metrics.updatedNotSelected}；阻塞 ${metrics.blocked}；未配置或跳过 ${metrics.skipped}${gapSuffix}。`;
}

function isProcessStatusSummary(summary) {
  return /最新\s*main|重新生成|结构化\s*JSON|内容单元|扩展为\s*\d+\s*条|generated from|regenerated|build log/i.test(summary);
}

function dailyIntent(report) {
  return {
    audience: "内容、产品、平台、策略与工程的一线从业者，关注 AI 行业内模型、公司、工具、产品、开源项目、观点和社区讨论。",
    primaryQuestion: `${report.report_date} 有哪些值得内容、产品、平台、策略与工程团队一起跟进的 AI 行业、模型、产品、开源、观点和社区动态？`,
    decision: "事实主线只保留可回溯的一手、官方、论文、GitHub 或多源确认条目；观点和社区线索必须披露来源层级与风险。",
    successCriteria: [
      "主体信息解释它与内容、产品、平台、策略或工程判断的关系",
      "观点、播客、社区讨论和产品雷达承载高密度但标明来源风险",
      "HTML 保留结构化导航、卡片、证据图片和 source_audit 附录",
      "结构化 JSON 可回溯到候选池与核验状态"
    ]
  };
}

function dailyHeroStats(report, collections) {
  const sourceWindow = report.source_window || {};
  const builderCount = collections.builderObservations.length;
  const aigcCount = countAigcSignals(collections);
  const sourceStats = sourceHeroStats(collections.sourceEffectiveness);
  const sourceStatCount = sourceStats.length;
  const stats = [
    ...sourceStats,
    { label: "主体", value: String(collections.mainItems.length), detail: "重点条目" },
    { label: "精选博客", value: String(collections.hotBlogs.length), detail: "深读" },
    { label: "GitHub", value: String(collections.githubTrending.length), detail: "Top 10" },
    { label: "Builder", value: String(builderCount), detail: "观察" },
    {
      label: "覆盖",
      value: formatHeroDateRange(sourceWindow.date_from, sourceWindow.date_to) || formatHeroDate(report.report_date),
      detail: sourceWindow.fallback_window_used ? "扩展时间范围" : "标准时间范围"
    }
  ];
  if (aigcCount > 0) {
    stats.splice(sourceStatCount + 1, 0, { label: "AIGC", value: String(aigcCount), detail: "产品/内容" });
  }
  if ((collections.dailyTracking?.length || 0) > 0) {
    const insertAt = sourceStatCount + (aigcCount > 0 ? 2 : 1);
    stats.splice(insertAt, 0, { label: "追踪", value: String(collections.dailyTracking.length), detail: "榜单变化" });
  }
  return stats;
}

function sourceFirstRows(rows = []) {
  return decorateSourceEffectivenessRows(Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id && row?.name);
}

function sourceHeroStats(rows = []) {
  const metrics = sourceFirstMetrics(rows);
  if (metrics.total === 0) {
    return [];
  }
  return [
    { label: "公开信源", value: `${metrics.included}/${metrics.total}`, detail: "进入公开页" },
    { label: "候选信源", value: String(metrics.updatedNotSelected), detail: "有更新未入选" },
    { label: "阻塞信源", value: String(metrics.blocked), detail: metrics.skipped > 0 ? `跳过 ${metrics.skipped}` : "需处理" }
  ];
}

function sourceFirstMetrics(rows = []) {
  const metrics = {
    total: rows.length,
    included: 0,
    updatedNotSelected: 0,
    parsedNotCandidate: 0,
    noRecentUpdate: 0,
    blocked: 0,
    skipped: 0
  };
  for (const row of rows) {
    const status = String(row?.status_label || "");
    if (status === "included") metrics.included += 1;
    else if (status === "updated_not_selected") metrics.updatedNotSelected += 1;
    else if (status === "parsed_not_candidate") metrics.parsedNotCandidate += 1;
    else if (status === "no_recent_update") metrics.noRecentUpdate += 1;
    else if (status === "blocked") metrics.blocked += 1;
    else if (status === "not_configured_or_skipped") metrics.skipped += 1;
  }
  return metrics;
}

function dateIndexHeroStats(item) {
  if (!item) {
    return [];
  }
  const strengthReasons = Array.isArray(item.strength?.reasons)
    ? item.strength.reasons.map((reason) => reason?.label).filter(Boolean).slice(0, 2)
    : [];
  const affectedSections = Array.isArray(item.quality?.affected_sections)
    ? item.quality.affected_sections.filter(Boolean).slice(0, 2)
    : [];
  return [
    {
      label: "日期强度",
      value: String(item.strength?.label || item.strength?.level || "未分级"),
      detail: strengthReasons.length > 0 ? strengthReasons.join(" / ") : "透明统计派生"
    },
    {
      label: "质量",
      value: String(item.quality?.label || item.quality?.status || "正常"),
      detail: affectedSections.length > 0 ? affectedSections.join(" / ") : "覆盖状态"
    }
  ];
}

function dailyAdjacentHeroLinks(report, { reportNavigation }) {
  const links = [];
  if (reportNavigation?.previous?.url) {
    links.push({
      label: "上一日",
      href: publicAssetUrl(report, reportNavigation.previous.url),
      icon: AI_DAILY_ICON
    });
  }
  if (reportNavigation?.next?.url) {
    links.push({
      label: "下一日",
      href: publicAssetUrl(report, reportNavigation.next.url),
      icon: AI_DAILY_ICON
    });
  }
  return links;
}

function dailyHeroEyebrow(report) {
  const range = formatHeroFullDateRange(report.source_window?.date_from, report.source_window?.date_to);
  return range ? `AI 日报 · 覆盖 ${range}` : "AI 日报";
}

function formatHeroFullDateRange(dateFrom, dateTo) {
  const start = formatFullDate(dateFrom);
  const end = formatFullDate(dateTo);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end || start === end) return start;
  return `${start} 至 ${end}`;
}

function formatFullDate(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function countAigcSignals(collections) {
  const items = [
    ...collections.mainItems,
    ...collections.hotBlogs,
    ...collections.githubTrending,
    ...collections.projects,
    ...collections.communityLeads
  ];
  return items.filter((item) => {
    const text = [
      item?.title,
      item?.name,
      item?.repo,
      item?.topic,
      item?.summary,
      item?.description,
      item?.content,
      Array.isArray(item?.tags) ? item.tags.join(" ") : ""
    ]
      .filter(Boolean)
      .join(" ");
    return /\bAIGC\b|video|image|creator|content|cover|multimodal|object detection|vision-language|speech|audio|TTS|AI PC|agent PC|Grok Imagine|Cosmos|MoneyPrinter|Qwen Code|Model Studio|多模态|图像|图片|视觉|视频|语音|声音|音频|目标检测|内容生成|生成内容|文生|生图|创作者|内容产业|文娱|短剧|数字人|具身智能/i.test(text);
  }).length;
}

function formatQualityStatus(status) {
  if (!status || typeof status !== "object" || status.status === "ok") {
    return "";
  }
  const label = status.status === "blocked" ? "阻断" : "降级";
  const note = String(status.public_note || "").trim();
  const issues = [
    ...(Array.isArray(status.blocking_issues) ? status.blocking_issues : []),
    ...(Array.isArray(status.degraded_sections) ? status.degraded_sections : []),
    ...affectedSectionIssues(status)
  ];
  const lines = [`- **状态**：${label}`];
  if (note) {
    lines.push(`- **公开说明**：${note}`);
  }
  for (const issue of issues) {
    const section = issue?.section || "unknown";
    const code = issue?.code || issue?.error_code || "quality_issue";
    const message = issue?.message || "";
    lines.push(`- **${section}**（${code}）：${message}`);
  }
  return lines.join("\n");
}

function affectedSectionIssues(status) {
  if (!Array.isArray(status.affected_sections) || status.affected_sections.length === 0) {
    return [];
  }
  const existing = new Set([
    ...(Array.isArray(status.blocking_issues) ? status.blocking_issues : []),
    ...(Array.isArray(status.degraded_sections) ? status.degraded_sections : [])
  ].map((issue) => issue?.section).filter(Boolean));
  return status.affected_sections
    .filter((section) => section && !existing.has(section))
    .map((section) => ({
      code: "affected_section_degraded",
      section,
      message: "该板块存在公开说明中的降级风险。"
    }));
}

function formatHeroDateRange(dateFrom, dateTo) {
  const startParts = compactDateParts(dateFrom);
  const endParts = compactDateParts(dateTo);
  const start = formatHeroDate(dateFrom);
  const end = formatHeroDate(dateTo);
  if (!start && !end) return "";
  if (!start) return end;
  if (!end || start === end) return start;
  if (startParts && endParts && startParts.year === endParts.year && startParts.month === endParts.month) {
    return `${startParts.month}.${startParts.day}-${endParts.day}`;
  }
  return `${start}..${end}`;
}

function formatHeroDate(value) {
  const parts = compactDateParts(value);
  return parts ? `${parts.month}.${parts.day}` : "";
}

function compactDateParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? { year: match[1], month: match[2], day: match[3] } : null;
}

export async function renderReportWithEffectiveInteract(report, options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const skillDir = await resolveSkillDir(rootDir, options.skillDir);
  const createScript = path.join(skillDir, "scripts", "create-interaction.mjs");
  const scratchDir =
    options.scratchDir || path.join(rootDir, ".tmp", `effective-interact-daily-${process.pid}`);
  const inputDir = path.join(scratchDir, "inputs");
  const outputDir = path.join(scratchDir, "html");
  const inputPath = path.join(inputDir, `${report.report_date}.json`);

  await fs.mkdir(inputDir, { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(inputPath, `${JSON.stringify(reportToInteractionInput(report, {
    rootDir,
    trendAnnotations: options.trendAnnotations,
    assetRootDir: options.assetRootDir,
    includeInternalSections: options.includeInternalSections
  }), null, 2)}\n`, "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    createScript,
    "--input",
    inputPath,
    "--out-dir",
    outputDir,
    "--slug",
    `ai-daily-${report.report_date}`,
    "--json"
  ], {
    cwd: rootDir,
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });

  let payload = null;
  try {
    payload = JSON.parse(stdout);
  } catch (error) {
    throw new PublisherError("effective_interact_output_invalid", "effective-interact 生成器输出不是有效 JSON。", {
      cause: error.message,
      stdout
    });
  }

  if (!payload.ok || !payload.outputPath) {
    throw new PublisherError("effective_interact_generation_failed", "effective-interact 生成器未返回有效 HTML 产物。", payload);
  }

  return normalizePublicHtml(await fs.readFile(payload.outputPath, "utf8"));
}

function publicAssetUrl(report, assetPath) {
  if (report.canonical_url && report.html_path) {
    return new URL(relativeAssetHref(report.html_path, assetPath), report.canonical_url).toString();
  }

  return new URL(assetPath, DEFAULT_SITE.siteUrl).toString();
}

async function resolveSkillDir(rootDir, requestedSkillDir) {
  if (requestedSkillDir) {
    return path.resolve(requestedSkillDir);
  }

  const candidates = [
    path.join(rootDir, ".codex/skills/effective-interact"),
    path.join(process.cwd(), ".codex/skills/effective-interact")
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "scripts", "create-interaction.mjs"));
      return path.resolve(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return path.resolve(candidates[0]);
}

function normalizePublicHtml(html) {
  const normalizedRel = html.replaceAll('rel="noreferrer"', 'rel="noopener noreferrer"');
  return normalizedRel.replace(/<a\b([^>]*\bhref="https?:\/\/[^"]+"[^>]*)>/gi, (match, attrs) => {
    let nextAttrs = attrs;
    if (!/\starget=/i.test(nextAttrs)) {
      nextAttrs += ' target="_blank"';
    }
    if (/\srel="/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(/\srel="([^"]*)"/i, (_relMatch, value) => {
        const relTokens = new Set(String(value || "").split(/\s+/).filter(Boolean));
        relTokens.add("noopener");
        relTokens.add("noreferrer");
        return ` rel="${[...relTokens].join(" ")}"`;
      });
    } else {
      nextAttrs += ' rel="noopener noreferrer"';
    }
    return `<a${nextAttrs}>`;
  });
}

function normalizeTrendAnnotations(value) {
  const annotations = value && typeof value === "object" ? value : {};
  return {
    main_items: Array.isArray(annotations.main_items) ? annotations.main_items : [],
    github_trending: Array.isArray(annotations.github_trending) ? annotations.github_trending : []
  };
}

function trendTagsFor(annotations, section, index) {
  const match = (annotations?.[section] || []).find((item) => item.index === index);
  if (!match || !Array.isArray(match.tags)) {
    return [];
  }
  return match.tags.map((tag) => tag.text || tag.label).filter(Boolean);
}

const STORY_TRACKS = [
  {
    key: "industry",
    title: "AI 行业动态",
    intro: "模型、公司、政策与基础设施层面的行业动向。",
    categories: new Set(["ai_industry", "model_release", "headline", "company_business", "policy_infra", "funding"]),
    trend: /行业|industry|company|business|policy|infra|model\s*release/i
  },
  {
    key: "content",
    title: "内容赛道动态",
    intro: "AIGC 内容生产与创作工作流相关动态。",
    categories: new Set(["content_aigc"]),
    trend: /content|aigc|内容|创作/i
  },
  {
    key: "engineering",
    title: "工程与开发者动态",
    intro: "面向开发者的产品、工具与工程实践更新。",
    categories: new Set(["engineering_toolchain", "product_radar"]),
    trend: /product|developer|workflow|tool|engineering|开发者|工程|产品|工作流/i
  },
  {
    key: "opensource",
    title: "开源动态",
    intro: "值得关注的开源模型与项目动态。",
    categories: new Set(["open_source"]),
    trend: /open[\s-]?source|开源/i
  }
];
const DEFAULT_STORY_TRACK_KEY = "industry";
const STORY_TRACK_MAX_ITEMS = 10;

// Story-first sections render as a Feishu-style dense doc: stories are grouped
// into editorial tracks, and each story is its own collapsed panel whose summary
// is a ~100-char teaser (collapsed) and whose content is the full read (expanded).
function formatStoryFirstSections(stories, context = {}) {
  if (!Array.isArray(stories) || stories.length === 0) {
    return formatMainItemSections([], context);
  }
  const mainItems = Array.isArray(context.report?.main_items) ? context.report.main_items : [];
  const mainById = mainItemByCandidateId(mainItems);
  const buckets = new Map(STORY_TRACKS.map((track) => [track.key, []]));
  stories.forEach((story, index) => {
    const mainItem = mainById.get(String(story?.story_id || "").trim()) || mainItems[index] || null;
    const key = storyTrackKey(story, mainItem);
    (buckets.get(key) || buckets.get(DEFAULT_STORY_TRACK_KEY)).push({ story, index });
  });
  const sections = [];
  for (const track of STORY_TRACKS) {
    const entries = (buckets.get(track.key) || []).slice(0, STORY_TRACK_MAX_ITEMS);
    if (entries.length === 0) {
      continue;
    }
    sections.push({
      type: "markdown",
      title: track.title,
      richId: `track-${track.key}`,
      group: "main",
      collapsed: false,
      content: `${track.intro}（本日 ${entries.length} 条）`
    });
    for (const { story, index } of entries) {
      sections.push(formatStoryDetailSection(story, index, context));
    }
  }
  return sections.length > 0 ? sections : formatMainItemSections([], context);
}

function mainItemByCandidateId(mainItems) {
  const byId = new Map();
  for (const item of mainItems) {
    const id = String(item?.candidate_id || "").trim();
    if (id && !byId.has(id)) {
      byId.set(id, item);
    }
  }
  return byId;
}

function storyTrackKey(story, mainItem) {
  const category = String(mainItem?.editorial_category || "").trim();
  if (category) {
    const matched = STORY_TRACKS.find((track) => track.categories.has(category));
    return matched ? matched.key : DEFAULT_STORY_TRACK_KEY;
  }
  const trend = String(story?.trend || "");
  const matched = STORY_TRACKS.find((track) => track.trend.test(trend));
  return matched ? matched.key : DEFAULT_STORY_TRACK_KEY;
}

function formatStoryDetailSection(story, index, context = {}) {
  const link = storyPrimaryLink(story);
  const storyTitle = readerFacingStoryTitle(story.title);
  const titleMarkdown = link
    ? markdownLink(link.url, storyTitle, { icon: siteIconForUrl(link.url, link.label || storyTitle), iconLabel: link.label })
    : storyTitle;
  const tags = formatHighlightTags([
    importanceTagFor("stories", story),
    storyEvidenceTag(story),
    ...trendTagsFor(context.trendAnnotations, "stories", index),
    ...trendTagsFor(context.trendAnnotations, "main_items", index)
  ].filter(Boolean));
  const sources = formatStorySourceLinks(story);
  const evidence = formatInlineEvidenceAssets(
    context.report,
    evidenceForUrl(context.evidenceByUrl, link?.url),
    context.mediaOptions
  );
  const content = [
    `**${titleMarkdown}**${tags}`,
    `- 发生了什么：${formatDailyInlineText(story.what_happened || "", story)}`,
    `- 为什么值得看：${formatDailyInlineText(story.why_it_matters || "", story)}`,
    sources ? `- 来源：${sources}` : "",
    evidence ? `\n${evidence}` : ""
  ].filter(Boolean).join("\n");
  return {
    type: "markdown",
    title: storyTitle,
    richId: `story-${index + 1}`,
    group: "main",
    collapsed: true,
    open: false,
    summary: storyTeaser(story),
    content
  };
}

function storyTeaser(story) {
  const raw = String(story?.why_it_matters || story?.what_happened || "").replace(/\s+/g, " ").trim();
  return trimText(stripPublicBodySourcePrefix(raw, story), 100);
}

function storyPrimaryLink(story) {
  return (Array.isArray(story?.sources) ? story.sources : []).find((source) => source?.url) || null;
}

function storyEvidenceTag(story) {
  const level = String(story?.evidence_level || "").trim();
  if (!level) {
    return "";
  }
  return cardTag(level, "topic");
}

function formatStorySourceLinks(story) {
  return (Array.isArray(story?.sources) ? story.sources : [])
    .filter((source) => source?.url)
    .map((source) => markdownLink(source.url, source.label || source.type || "Source", {
      icon: siteIconForUrl(source.url, source.label || story?.title),
      iconLabel: source.label || source.type
    }))
    .join(" / ");
}

function formatMainItemSections(items, context = {}) {
  if (items.length === 0) {
    return [
      {
        type: "markdown",
        title: "AI 行业动态",
        group: "main",
        content: emptyMainItemContent(context)
      }
    ];
  }

  if (context.compactMainItems) {
    return formatCompactMainItemSections(items, context);
  }

  return mainItemContractGroups(items).map((group) => ({
    type: "markdown",
    title: group.title,
    group: "main",
    content: group.entries
      .map(({ item, originalIndex }) => formatMainItem(item, {
        ...context,
        originalIndex,
        displayIndex: originalIndex + 1
      }))
      .join("\n\n")
  }));
}

function formatCompactMainItemSections(items, context = {}) {
  if (context.promptLayerLayout) {
    return [
      {
        type: "filterable-cards",
        title: "Today's signal cards",
        richId: "main-signal-cards",
        group: "main",
        cardClass: "main-ticket-card",
        showFilters: false,
        items: items.map((item, index) => formatCompactMainItemCard(item, index, context))
      }
    ];
  }

  const detailContent = mainItemContractGroups(items).map((group) => {
    const content = group.entries
      .map(({ item, originalIndex }) => formatMainItem(item, {
        ...context,
        originalIndex,
        displayIndex: originalIndex + 1
      }))
      .join("\n\n");
    return `### ${group.title}\n\n${content}`;
  }).join("\n\n");

  return [
    {
      type: "markdown",
      title: "今日主线",
      richId: "story-list",
      group: "main",
      collapsed: false,
      content: detailContent
    }
  ];
}

function formatCompactMainItemCard(item, index, context = {}) {
  const facts = mainItemPublicFacts(item);
  const category = mainItemCategoryLabel(item);
  const tags = [
    cardTag(category, "topic"),
    importanceTagFor("main_items", item),
    sourceTrustHighlightTag(item),
    ...trendTagsFor(context.trendAnnotations, "main_items", index)
  ].filter(Boolean);
  return {
    group: String(index + 1).padStart(2, "0"),
    title: mainItemTitle(item),
    subtitle: [item.source, item.event_date].filter(Boolean).join(" / "),
    url: item.url,
    titleIcon: siteIconForUrl(item.url, item.source || item.title),
    tags,
    body: trimText(stripPublicBodySourcePrefix(facts[0] || item.summary || "", item), 220),
    points: []
  };
}

function mainItemCategoryLabel(item) {
  const category = String(item?.editorial_category || "");
  if (category === "content_aigc") return "AIGC";
  if (category === "product_radar" || category === "engineering_toolchain") return "产品/工具";
  if (category === "open_source") return "开源";
  if (category === "company_business" || category === "policy_infra" || category === "funding") return "业务/政策";
  if (category === "viewpoint_analysis" || category === "community_signal") return "观察";
  return "主线";
}

function emptyMainItemContent(context = {}) {
  if (context.report?.report_status === "empty_due_to_network_outage") {
    return "本次固定信源发现面全部因网络不可用阻塞，未写入未核验主体事实。请展开“发布质量说明”和“信源审计”查看各来源状态。";
  }
  return "暂无已核验信号。";
}

function formatMainItem(item, context = {}) {
  const bullets = mainItemPublicFacts(item)
    .map((bullet) => `  - ${formatDailyInlineText(bullet, item)}`)
    .join("\n");
  const title = markdownLink(item.url, mainItemTitle(item), { icon: mainItemIconFor(item), iconLabel: item.source });
  const trendTags = formatHighlightTags([
    importanceTagFor("main_items", item),
    sourceTrustHighlightTag(item),
    ...trendTagsFor(context.trendAnnotations, "main_items", context.originalIndex)
  ].filter(Boolean));
  const evidence = formatInlineEvidenceAssets(context.report, evidenceForUrl(context.evidenceByUrl, item.url), context.mediaOptions);
  const storySources = formatStorySources(context.storyById?.get(item.candidate_id), item);
  return `${context.displayIndex}. **${title}**${trendTags}（${item.event_date}）\n${bullets}${storySources ? `\n${storySources}` : ""}${evidence ? `\n\n${evidence}` : ""}`;
}

function storyIndexById(stories) {
  const index = new Map();
  for (const story of stories) {
    const id = String(story?.story_id || "").trim();
    if (id) {
      index.set(id, story);
    }
  }
  return index;
}

function formatStorySources(story, item) {
  const sources = Array.isArray(story?.sources) ? story.sources : [];
  if (sources.length === 0) {
    return "";
  }
  const links = sources
    .filter((source) => source?.url)
    .map((source) => markdownLink(source.url, source.label || source.type || "Source", {
      icon: siteIconForUrl(source.url, source.label || item?.source || item?.title),
      iconLabel: source.label || item?.source
    }))
    .filter(Boolean);
  if (links.length === 0) {
    return "";
  }
  return `  - **来源**：${links.join(" / ")}`;
}

function mainItemPublicFacts(item) {
  const facts = [
    item?.summary,
    ...(Array.isArray(item?.bullets) ? item.bullets : [])
  ];
  return facts
    .map((bullet) => String(bullet || "").trim())
    .filter(Boolean)
    .filter((bullet) => !isMainItemTemplateBullet(bullet))
    .slice(0, 3);
}

function isMainItemTemplateBullet(value) {
  const text = String(value || "");
  return /(?:^|\n)\s*(?:(?:==(?:keyword-[^|=]+|tag-[^|=]+)\|(?:影响|留意)==)|(?:==(?:影响|留意)==)|(?:影响|留意))[:：]/u.test(text) ||
    /(?:它影响开发者和产品团队能否直接复用官方代码|看仓库活跃度、README、许可证、模型卡|它提示某个产品、平台或服务是否接近可试用|看是否有明确入口、价格、地区、权限|可用它判断是否值得跟进|可用它判断是否需要试用|不直接做 AI 的读者也可用它判断行业风向)/u.test(text);
}

function mainItemContractGroups(items) {
  const groups = [
    {
      title: "AI 行业动态",
      categories: new Set(["ai_industry", "model_release", "headline", "company_business", "policy_infra", "funding", "engineering_toolchain", "product_radar", "open_source"])
    },
    {
      title: "内容赛道动态",
      categories: new Set(["content_aigc"])
    }
  ].map((group) => ({ ...group, entries: [] }));
  const fallback = groups[0];

  items.forEach((item, originalIndex) => {
    const category = String(item?.editorial_category || "").trim();
    const group = groups.find((entry) => entry.categories.has(category)) || fallback;
    group.entries.push({ item, originalIndex });
  });

  return groups.filter((group) => group.entries.length > 0);
}

function formatGithubTrending(items, context = {}) {
  const projects = Array.isArray(context.projects) ? context.projects : [];
  if (items.length === 0 && projects.length === 0) {
    return "";
  }

  const projectIndex = indexProjects(projects);
  const trendingLines = items
    .slice(0, 8)
    .map((item, index) => {
      const project = projectForTrend(item, projectIndex);
      const tag = githubTrendStatusHighlightTag(item);
      const tagText = formatHighlightTags([
        importanceTagFor("github_trending", item),
        sourceTrustHighlightTag(item),
        tag,
        githubStarsTag(item),
        githubReadmeStatusTag(item),
        ...(project ? projectHeatTags(project) : []),
        ...trendTagsFor(context.trendAnnotations, "github_trending", index)
      ].filter(Boolean));
      const details = githubTrendDetails(item, project).join("；");
      return `${item.rank}. **${markdownLink(item.url, item.name || item.repo)}**${tagText}${details ? `: ${details}` : ""}`;
    })
    .join("\n");
  return trendingLines;
}

function formatGithubTrendingCards(items, context = {}) {
  const projects = Array.isArray(context.projects) ? context.projects : [];
  const projectIndex = indexProjects(projects);
  return items.slice(0, 8).map((item, index) => {
    const project = projectForTrend(item, projectIndex);
    const rank = Number.isFinite(Number(item.rank)) ? `#${Number(item.rank)}` : `#${index + 1}`;
    const repo = item.repo || item.name || repoFromUrl(item.url);
    const readmeStatus = githubReadmeStatusTag(item);
    const tags = [
      importanceTagFor("github_trending", item),
      sourceTrustHighlightTag(item),
      githubTrendStatusHighlightTag(item),
      githubStarsTag(item),
      readmeStatus,
      item.language ? cardTag(item.language, "topic") : "",
      item.window ? cardTag(item.window, "topic") : "",
      ...(project ? projectHeatTags(project) : []),
      ...trendTagsFor(context.trendAnnotations, "github_trending", index)
    ].filter(Boolean);

    return {
      group: rank,
      title: repo || item.name || "Repository",
      href: item.url,
      titleIcon: siteIconForUrl(item.url, repo || item.name),
      subtitle: [item.source, item.event_date].filter(Boolean).join(" / "),
      body: githubTrendCardBody(item, project),
      showGroup: true,
      tags,
      points: []
    };
  });
}

function githubTrendCardBody(item, project) {
  const repo = item.repo || item.name || repoFromUrl(item.url);
  const description = stripGithubRepoLead(
    cleanGithubTrendDescription(item),
    repo
  );
  const projectDetail = stripGithubRepoLead(projectHighlightDetail(project, description), repo);
  const fallback = stripGithubRepoLead(String(item.evidence || ""), repo);
  const body = uniqueTextFragments([description, projectDetail, fallback])
    .map((fragment) => cleanGithubTrendCardFragment(fragment))
    .filter((fragment) => !isGenericGithubTrendDescription(fragment))
    .slice(0, 2)
    .join(" ");
  if (!body || isWeakGithubTrendCardBody(body)) {
    return githubTrendMovementSummary(item);
  }
  return trimText(body, 220);
}

function isWeakGithubTrendCardBody(value) {
  const text = String(value || "");
  return /README 将|核心能力集中在|它的价值在于|具体阅读时|把这些能力整理成可复现|领域：/u.test(text);
}

function githubTrendMovementSummary(item) {
  const rank = Number.isFinite(Number(item?.rank)) ? `#${Number(item.rank)}` : "";
  const source = String(item?.source || "GitHub Trending").trim();
  const sourceLabel = source || "GitHub Trending";
  const stars = githubTrendStarsMovement(item);
  const move = githubTrendRankMovement(item);
  const repo = item?.repo || item?.name || repoFromUrl(item?.url);
  const intent = githubRepoIntentSummary(repo);
  const facts = [sourceLabel, rank, stars, move].filter(Boolean).join(" / ");
  return trimText(`${repo ? `${repo}：` : ""}${intent}${facts ? `（${facts}）` : ""}`, 220);
}

function githubRepoIntentSummary(repo) {
  const name = String(repo || "").split("/").pop() || "";
  const normalized = name.toLowerCase().replace(/[-_]+/g, " ");
  if (/memory|mem0|recall|knowledge|context/.test(normalized) && /mcp|agent|codebase|repo|repository/.test(normalized)) {
    return "先按代码库记忆、上下文检索或 MCP 集成方向核查可运行入口、权限边界和维护活跃度。";
  }
  if (/agent|workflow|tool|browser|automation|eval|bench|test/.test(normalized)) {
    return "先按 agent 工作流、评测或自动化工具方向核查示例覆盖、运行前提和团队接入成本。";
  }
  if (/model|llm|rag|embedding|inference|prompt/.test(normalized)) {
    return "先按模型应用、检索或推理工具方向核查任务边界、依赖和可复现样例。";
  }
  if (/ui|web|app|editor|studio|dashboard/.test(normalized)) {
    return "先按产品界面或开发者工具方向核查核心场景、部署方式和近期维护。";
  }
  return "先核查仓库解决的具体问题、可运行入口、许可证和近期维护，再决定是否进入试用。";
}

function githubTrendStarsMovement(item) {
  const evidence = String(item?.evidence || "");
  const match = evidence.match(/with\s+([0-9,]+)\s+stars\s+(today|this week)/i);
  if (!match) {
    return "";
  }
  return `${match[2].toLowerCase() === "today" ? "今日" : "本周"} +${match[1]} stars`;
}

function githubTrendRankMovement(item) {
  const previousRank = Number.isFinite(Number(item?.previous_rank)) ? Number(item.previous_rank) : null;
  const rankDelta = Number.isFinite(Number(item?.rank_delta)) ? Number(item.rank_delta) : null;
  if (previousRank === null || rankDelta === null) {
    return "";
  }
  if (rankDelta > 0) {
    return `较前次上升 ${rankDelta} 位`;
  }
  if (rankDelta < 0) {
    return `较前次下降 ${Math.abs(rankDelta)} 位`;
  }
  return "较前次持平";
}

function cleanGithubTrendCardFragment(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^README\s*(?:将该仓库定位为|把该仓库定位为|说明该项目是|显示该项目是)?\s*/u, "")
    .replace(/它的价值在于[^。]*。?/gu, "")
    .replace(/具体阅读时还应关注[^。]*。?/gu, "")
    .replace(/优先核对\s*README[^。]*。?/gu, "")
    .trim();
}

function stripGithubRepoLead(value, repo) {
  let text = String(value || "").replace(/\s+/g, " ").trim();
  const repoText = String(repo || "").trim();
  if (!text || !repoText) {
    return text;
  }

  const escapedRepo = escapeRegex(repoText);
  text = text
    .replace(new RegExp(`^${escapedRepo}\\s*[:：-]\\s*`, "i"), "")
    .replace(new RegExp(`^${escapedRepo}\\s+`, "i"), "")
    .trim();

  if (repoText.includes("/")) {
    const [owner, name] = repoText.split("/");
    text = text
      .replace(new RegExp(`^${escapeRegex(owner)}\\s*/\\s*${escapeRegex(name)}\\s*[:：-]?\\s*`, "i"), "")
      .replace(new RegExp(`^${escapeRegex(name)}\\s*[:：-]\\s*`, "i"), "")
      .trim();
  }

  return text;
}

function isGenericGithubTrendDescription(value) {
  return /(?:GitHub Trending Top 10|appeared on GitHub Trending|Today entered|rank #|stars today|stars this week|README\s*主要围绕|阅读时先看|提供README|提供可复用包|测试或评估资产|README 将该仓库定位为|核心能力集中在|它的价值在于|具体阅读时|适合评估[^。]*README)/i.test(String(value || ""));
}

function formatHuggingFaceTrending(items, context = {}) {
  const rows = items.slice(0, 10).map((item, index) => {
    const tagText = formatHighlightTags([
      importanceTagFor("huggingface_trending", item),
      sourceTrustHighlightTag(item),
      item.task ? `task: ${item.task}` : "",
      Number(item.likes) > 0 ? `${item.likes} likes` : "",
      Number(item.downloads) > 0 ? `${item.downloads} downloads` : "",
      ...trendTagsFor(context.trendAnnotations, "huggingface_trending", index)
    ].filter(Boolean));
    const details = [
      trimText(item.description || item.evidence || "", 120),
      Number(item.likes) > 0 ? `likes ${item.likes}` : "",
      Number(item.downloads) > 0 ? `downloads ${item.downloads}` : ""
    ].filter(Boolean).join(" / ");
    return `${Number(item.rank || index + 1)}. **${markdownLink(item.url, item.name || item.repo)}**${tagText}${details ? `: ${details}` : ""}`;
  });
  return rows.join("\n");
}

function githubTrendDetails(item, project) {
  const bullets = [];
  const hasReadmeSummary = Boolean(String(item?.readme_summary || item?.github_readme_summary || "").trim());
  const description = trimText(cleanGithubTrendDescription(item), 120);
  if (description) {
    bullets.push(description);
  }

  const projectDetail = hasReadmeSummary ? projectHighlightDetail(project, description) : "";
  if (projectDetail) {
    bullets.push(projectDetail);
  }

  const rankMove = githubRankMove(item);
  if (rankMove) {
    bullets.push(rankMove);
  }

  return [...new Set(bullets.map((bullet) => trimText(bullet, 130)).filter(Boolean))].slice(0, 4);
}

function githubReadmeStatusTag(item) {
  return isGithubReadmeFetchFailed(item) ? "README拉取失败" : "";
}

function isGithubReadmeFetchFailed(item = {}) {
  const status = String(item.readme_fetch_status || item.readme_status || item.readme?.status || "").toLowerCase();
  return /fail|failed|error|unavailable|blocked|timeout/.test(status) || Boolean(item.readme_error);
}

function githubRankMove(item) {
  const rank = Number.isFinite(Number(item.rank)) ? `#${item.rank}` : "";
  const previousRank = Number.isFinite(Number(item.previous_rank)) ? Number(item.previous_rank) : null;
  const rankDelta = Number.isFinite(Number(item.rank_delta)) ? Number(item.rank_delta) : null;
  if (previousRank === null || rankDelta === null) {
    return rank ? `${rank}，近 7 天首次进入观察窗口` : "";
  }
  if (rankDelta > 0) {
    return `${rank}，较前一日上升 ${rankDelta} 位`;
  }
  if (rankDelta < 0) {
    return `${rank}，较前一日下降 ${Math.abs(rankDelta)} 位`;
  }
  return `${rank}，较前一日持平`;
}

function githubTrendVelocity(item) {
  const evidence = String(item.evidence || "");
  const match = evidence.match(/with\s+([0-9,]+)\s+stars today/i);
  return match ? `今日 +${match[1]} stars` : "";
}

function githubStarsTag(item) {
  return githubTrendVelocity(item);
}

function indexProjects(projects) {
  const byUrl = new Map();
  const byRepo = new Map();
  for (const project of projects) {
    const urlKey = normalizeEvidenceUrl(project?.url);
    if (urlKey) {
      byUrl.set(urlKey, project);
    }
    const repoKey = repoKeyFromProject(project);
    if (repoKey) {
      byRepo.set(repoKey, project);
    }
  }
  return { byUrl, byRepo };
}

function projectForTrend(item, projectIndex) {
  const urlKey = normalizeEvidenceUrl(item?.url);
  if (urlKey && projectIndex.byUrl.has(urlKey)) {
    return projectIndex.byUrl.get(urlKey);
  }
  const repoKey = repoKeyFromTrend(item);
  return repoKey ? projectIndex.byRepo.get(repoKey) : null;
}

function repoKeyFromTrend(item) {
  return normalizeRepoKey(item?.repo || item?.name || repoFromUrl(item?.url));
}

function repoKeyFromProject(project) {
  return normalizeRepoKey(project?.repo || project?.name || repoFromUrl(project?.url));
}

function repoFromUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (!parsed.hostname.toLowerCase().includes("github.com")) {
      return "";
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : "";
  } catch {
    return "";
  }
}

function normalizeRepoKey(value) {
  return String(value || "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/$/, "").toLowerCase();
}

function projectHighlightDetail(project, baseDescription = "") {
  if (!project) {
    return "";
  }
  const hasBaseDescription = Boolean(String(baseDescription || "").trim());
  const projectDescription = isGenericGithubTrendDescription(project.description) ? "" : cleanProjectDescription(project.description);
  const description = hasBaseDescription || isNearDuplicateText(projectDescription, baseDescription) ? "" : projectDescription;
  const hasDomains = Array.isArray(project.domains) && project.domains.length > 0;
  const domains = hasDomains
    ? `领域：${project.domains.join("、")}`
    : "";
  const useCaseText = String(project.use_case || "").trim();
  const useCase = useCaseText && !isGenericGithubTrendDescription(useCaseText) && !(hasBaseDescription && hasDomains) && !isNearDuplicateText(useCaseText, [baseDescription, description].filter(Boolean).join(" "))
    ? `适合：${useCaseText}`
    : "";
  return uniqueTextFragments([description, domains, useCase]).join(" ");
}

function uniqueTextFragments(fragments) {
  const result = [];
  for (const fragment of fragments.map((item) => String(item || "").trim()).filter(Boolean)) {
    if (!result.some((existing) => isNearDuplicateText(fragment, existing))) {
      result.push(fragment);
    }
  }
  return result;
}

function isNearDuplicateText(left, right) {
  const leftTokens = semanticTokens(left);
  const rightTokens = semanticTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }

  const leftText = normalizeSemanticText(left);
  const rightText = normalizeSemanticText(right);
  if (leftText.length >= 16 && rightText.length >= 16 && (leftText.includes(rightText) || rightText.includes(leftText))) {
    return true;
  }

  const rightSet = new Set(rightTokens);
  const shared = new Set(leftTokens.filter((token) => rightSet.has(token))).size;
  const smaller = Math.min(new Set(leftTokens).size, rightSet.size);
  return smaller >= 4 && shared / smaller >= 0.45;
}

function semanticTokens(value) {
  const text = normalizeSemanticText(value);
  if (!text) {
    return [];
  }
  const tokens = text.match(/[a-z0-9][a-z0-9+#._-]*/g) || [];
  const cjk = text.replace(/[^\p{Script=Han}]/gu, "");
  for (let index = 0; index < cjk.length - 1; index += 1) {
    tokens.push(cjk.slice(index, index + 2));
  }
  return [...new Set(tokens.filter((token) => token.length > 1))];
}

function normalizeSemanticText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}+#._-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimText(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatProjects(items) {
  if (items.length === 0) {
    return "";
  }

  return items
    .map((item) => {
      const domains = Array.isArray(item.domains) && item.domains.length > 0 ? `\n  - 领域：${item.domains.join("、")}` : "";
      const useCase = item.use_case ? `\n  - 作用：${item.use_case}` : "";
      return `- **${markdownLink(item.url, item.name)}**${formatHighlightTags([importanceTag(item), ...projectHeatTags(item)].filter(Boolean))}：${cleanProjectDescription(item.description)}${domains}${useCase}`;
    })
    .join("\n");
}

function formatProjectCards(items) {
  return items.map((item) => {
    const domains = Array.isArray(item.domains) ? item.domains.filter(Boolean) : [];
    const points = editorialCardPoints(item);
    if (domains.length > 0) {
      points.push({ label: "领域", value: domains.join("、") });
    }
    if (item.use_case) {
      points.push({ label: "作用", value: item.use_case });
    }

    return {
      group: domains[0] || "PROJECTS",
      title: item.name,
      href: item.url,
      titleIcon: siteIconForUrl(item.url, item.name),
      body: cleanProjectDescription(item.description),
      tags: [importanceTagFor("projects", item), ...projectHeatTags(item)].filter(Boolean),
      points
    };
  });
}

function formatDailyTrackingCards(items, context = {}) {
  return items.map((item) => {
    const component = trackingComponentForInteraction(item);
    const invalidOfficialSnapshot = hasInvalidOfficialTrackingSnapshot(item);
    const unavailable = isDailyTrackingSourceUnavailable(item) || invalidOfficialSnapshot;
    const entries = unavailable ? [] : dailyTrackingLeaderboardEntries(item);
    const publicComponent = unavailable ? null : dailyTrackingPublicComponent(component, entries);
    const stats = unavailable ? [] : dailyTrackingStats(item, entries);
    const bars = unavailable ? { rows: [] } : dailyTrackingProviderBars(entries);
    const table = unavailable ? { rows: [] } : dailyTrackingTable(item, entries);
    const media = formatCardMedia(context.report, evidenceForUrl(context.evidenceByUrl, item.url), {
      limit: 5,
      ...(context.mediaOptions || {})
    });
    return {
      group: dailyTrackingCategoryLabel(item.category),
      title: item.name,
      href: item.url,
      titleIcon: siteIconForUrl(item.url, item.source || item.name),
      body: unavailable ? dailyTrackingUnavailableNote(item, invalidOfficialSnapshot) : formatDailyTrackingBody(item, entries),
      showGroup: true,
      tags: [
        cardTag(importanceTagFor("daily_tracking", item)),
        cardTag(dailyTrackingCategoryLabel(item.category), "topic"),
        item.event_date ? cardTag(item.event_date, "date") : ""
      ].filter(Boolean),
      points: [],
      ...(media.length > 0 ? { media } : {}),
      ...(publicComponent ? { component: publicComponent } : {}),
      ...(stats.length > 0 ? { stats } : {}),
      ...(bars.rows.length > 0 ? { bars } : {}),
      ...(table.rows.length > 0 ? { table } : {})
    };
  });
}

function dailyTrackingPublicComponent(component, entries) {
  if (!component || typeof component !== "object") {
    return null;
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    return component;
  }
  const sanitized = { ...component };
  delete sanitized.officialSnapshot;
  delete sanitized.official_component_snapshot;
  return sanitized;
}

function dailyTrackingLeaderboardEntries(item) {
  const snapshotEntries = Array.isArray(item?.snapshot?.top_entries) ? item.snapshot.top_entries : [];
  const normalized = snapshotEntries
    .map((entry, index) => normalizeDailyTrackingEntry(entry, index))
    .filter(Boolean);
  if (normalized.length > 0) {
    return normalized.slice(0, 10);
  }

  const metrics = Array.isArray(item?.metrics) ? item.metrics : [];
  return metrics
    .map((metric, index) => parseDailyTrackingMetricEntry(metric, index))
    .filter(Boolean)
    .slice(0, 10);
}

function normalizeDailyTrackingEntry(entry, index) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const rank = Number(entry.rank || index + 1);
  const model = String(entry.model || entry.name || entry.title || "").trim();
  const provider = String(entry.provider || entry.vendor || entry.source || "").trim();
  const tokens = String(entry.tokens || entry.usage || entry.value || "").trim();
  const change = normalizeTrackingChange(entry.change || entry.weekly_change || entry.delta || "");
  if (!model && !tokens) {
    return null;
  }
  return {
    rank: Number.isFinite(rank) && rank > 0 ? rank : index + 1,
    model: model || "未命名条目",
    provider,
    tokens,
    change
  };
}

function parseDailyTrackingMetricEntry(metric, index) {
  const label = String(metric?.label || "").trim();
  if (!/^#\d+/.test(label)) {
    return null;
  }
  const value = String(metric?.value || "").trim();
  const rank = Number(label.replace(/[^\d]/g, "")) || index + 1;
  const match = value.match(/^\s*(.+?)(?:[（(]([^)）]+)[)）])?\s*[：:]\s*(.+?)(?:[，,；;]\s*(?:周变化|change)\s*(.+))?$/i);
  if (!match) {
    return {
      rank,
      model: value || label,
      provider: "",
      tokens: "",
      change: normalizeTrackingChange(metric?.trend || "")
    };
  }
  return {
    rank,
    model: String(match[1] || "").trim(),
    provider: String(match[2] || "").trim(),
    tokens: String(match[3] || "").trim(),
    change: normalizeTrackingChange(match[4] || metric?.trend || "")
  };
}

function normalizeTrackingChange(value) {
  const text = String(value || "").replace(/^周变化\s*/u, "").trim();
  if (!text) {
    return "";
  }
  if (/^new$/i.test(text)) {
    return "NEW";
  }
  const percent = text.match(/-?\d+(?:\.\d+)?\s*%/);
  if (percent) {
    const compact = percent[0].replace(/\s+/g, "");
    return compact.startsWith("-") ? compact : `+${compact}`;
  }
  return text;
}

function dailyTrackingStats(item, entries) {
  if (entries.length > 0) {
    const top = entries[0];
    const biggest = biggestTrackingChange(entries);
    const newEntries = entries.filter((entry) => entry.change === "NEW");
    return [
      { label: "覆盖", value: `Top ${entries.length}`, detail: dailyTrackingSnapshotStatus(item) },
      {
        label: "榜首",
        value: top.model,
        detail: [top.provider, top.tokens, top.change].filter(Boolean).join(" / ")
      },
      biggest ? {
        label: "最大变化",
        value: biggest.model,
        detail: biggest.change
      } : null,
      newEntries.length > 0 ? {
        label: "新进榜",
        value: newEntries.map((entry) => entry.model).join("、"),
        detail: `${newEntries.length} 个条目`
      } : null
    ].filter(Boolean);
  }

  const metrics = Array.isArray(item?.metrics) ? item.metrics.filter((metric) => metric?.label || metric?.value) : [];
  return [
    metrics[0] ? { label: metrics[0].label || "核心指标", value: metrics[0].value || "", detail: dailyTrackingCategoryLabel(item.category) } : null,
    item.event_date ? { label: "日期", value: item.event_date, detail: "公开追踪" } : null
  ].filter(Boolean);
}

function dailyTrackingSnapshotStatus(item) {
  const status = String(item?.snapshot?.snapshot_status || "").trim();
  if (status === "complete") {
    return "公开榜单已解析";
  }
  if (status === "partial") {
    return "公开榜单部分解析";
  }
  return "公开页面";
}

function biggestTrackingChange(entries) {
  return entries
    .map((entry) => ({ entry, value: numericTrackingChange(entry.change) }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0]?.entry || null;
}

function numericTrackingChange(value) {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function dailyTrackingProviderBars(entries) {
  const counts = new Map();
  for (const entry of entries) {
    const provider = entry.provider || "unknown";
    counts.set(provider, (counts.get(provider) || 0) + 1);
  }
  const rows = Array.from(counts.entries())
    .map(([label, value]) => ({ label, value, status: `${value}/${entries.length}` }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return {
    title: "供应商分布",
    rows
  };
}

function dailyTrackingTable(item, entries) {
  if (entries.length > 0) {
    const valueLabel = item?.category === "model_benchmark"
      ? "分数"
      : item?.category === "coding_benchmark"
        ? "结果"
        : "调用量";
    const changeLabel = item?.category === "model_benchmark"
      ? "指标"
      : item?.category === "coding_benchmark"
        ? "变化"
        : "周变化";
    return {
      title: "Top 10 榜单",
      columns: [
        { key: "rank", label: "排名", width: "64px", align: "center" },
        { key: "model", label: "模型" },
        { key: "provider", label: "供应商", width: "120px" },
        { key: "tokens", label: valueLabel, width: "130px", align: "right" },
        { key: "change", label: changeLabel, width: "96px", align: "right" }
      ],
      rows: entries.map((entry) => ({
        rank: `#${entry.rank}`,
        model: entry.model,
        provider: entry.provider || "未知",
        tokens: entry.tokens || "未披露",
        change: entry.change || "未披露"
      }))
    };
  }

  const rows = Array.isArray(item?.metrics)
    ? item.metrics
        .filter((metric) => metric?.label || metric?.value)
        .map((metric) => ({
          label: metric.label || "指标",
          value: metric.value || ""
        }))
    : [];
  return {
    title: "追踪指标",
    columns: [
      { key: "label", label: "指标", width: "150px" },
      { key: "value", label: "当前值" }
    ],
    rows
  };
}

function formatDailyTrackingBody(item, entries) {
  if (entries.length > 0) {
    const top = entries[0];
    const biggest = biggestTrackingChange(entries);
    const newEntries = entries.filter((entry) => entry.change === "NEW");
    const parts = [
      `榜首 ${top.model}${top.provider ? `（${top.provider}）` : ""}${top.tokens ? `，${top.tokens}` : ""}${top.change ? `，${top.change}` : ""}`,
      biggest && biggest !== top ? `最大周变化是 ${biggest.model}（${biggest.change}）` : "",
      newEntries.length > 0 ? `新进榜：${newEntries.map((entry) => entry.model).join("、")}` : ""
    ].filter(Boolean);
    return formatDailyInlineText(`${parts.join("；")}。`, item);
  }

  const summary = stripPublicBodySourcePrefix(item.summary, item)
    .replace(/\s+/g, " ")
    .trim();
  const firstSentence = summary.split(/(?<=[。！？!?；;])\s*/u).find(Boolean) || summary;
  return formatDailyInlineText(firstSentence, item);
}

function isPublicDailyTrackingChange(item) {
  if (isDailyTrackingSourceUnavailable(item)) {
    return true;
  }
  if (item?.publish_to_public !== true) {
    return false;
  }
  if (String(item?.change_status || "") !== "changed") {
    return false;
  }
  return item?.verification_status === "primary_confirmed" || item?.verification_status === "multi_source_confirmed";
}

function isDailyTrackingSourceUnavailable(item) {
  return item?.publish_to_public === true && Boolean(String(item?.source_unavailable_note || "").trim());
}

function dailyTrackingUnavailableNote(item, invalidOfficialSnapshot = false) {
  const note = String(item?.source_unavailable_note || "").trim();
  if (note) {
    return note;
  }
  if (invalidOfficialSnapshot) {
    return "官方 web 组件 snapshot 本轮不可用：采集结果命中了整页级 DOM（如 main/body）或过大的页面片段。为避免渲染未核验的巨型页面组件，本卡只保留官方入口供读者手动核对。";
  }
  return "官方 web 组件 snapshot 本轮不可用，本卡只保留官方入口供读者手动核对。";
}

function dailyTrackingCategoryLabel(category) {
  if (category === "model_usage") return "模型使用";
  if (category === "model_benchmark") return "模型基准";
  if (category === "coding_benchmark") return "代码基准";
  return "每日追踪";
}

function formatHotBlogCards(items, context = {}) {
  return items.map((item) => {
    const media = formatCardMediaForItem(context.report, item, evidenceForUrl(context.evidenceByUrl, item.url), {
      ...(context.mediaOptions || {})
    });
    const body = String(item.summary || "").trim();
    return {
      group: item.topic || item.publisher || "BLOG",
      title: item.title,
      href: item.url,
      subtitle: [item.publisher || item.source, item.event_date || item.published_at].filter(Boolean).join(" / "),
      titleIcon: siteIconForUrl(item.url, item.publisher || item.title),
      body,
      showGroup: false,
      tags: [
        cardTag(importanceTagFor("hot_blogs", item)),
        sourceTrustCardTag(item),
        ...hotBlogTags(item).map((tag) => cardTag(tag, "topic"))
      ].filter(Boolean),
      points: [],
      ...(media.length > 0 ? { media } : {})
    };
  });
}

function formatOfficialOrgUpdateCards(items, context = {}) {
  return items.map((item) => {
    const media = formatCardMediaForItem(context.report, item, evidenceForUrl(context.evidenceByUrl, item.url), {
      ...(context.mediaOptions || {})
    });
    return {
      group: item.organization || item.source || "Official",
      title: item.title,
      href: item.url,
      titleIcon: siteIconForUrl(item.url, item.organization || item.source || item.title),
      body: String(item.summary || "").trim(),
      showGroup: true,
      tags: [
        cardTag(importanceTagFor("official_org_updates", item)),
        sourceTrustCardTag(item),
        item.event_date ? cardTag(item.event_date, "date") : ""
      ].filter(Boolean),
      points: editorialCardPoints(item, { includeReaderRelevance: false, includeWatchNext: false }),
      ...(media.length > 0 ? { media } : {})
    };
  });
}

function formatBuilderObservationCards(items, report, context = {}) {
  return items.map((item) => {
    const handle = builderHandle(item);
    const body = builderOriginalBodyText(item);
    const media = formatBuilderMedia(report, item, context.mediaOptions || {});
    const displayName = builderDisplayName(item, handle);

    return {
      group: "X/Twitter",
      title: displayName,
      href: item.url,
      subtitle: handle ? `@${handle}` : "",
      titleIcon: builderAvatarIcon(report, item, context.mediaOptions || {}),
      body: formatDailyInlineText(body, item),
      showGroup: false,
      tags: [
        cardTag(importanceTagFor("builder_observations", item)),
        sourceTrustCardTag(item),
        item.role ? cardTag(item.role, "topic") : "",
        item.event_date ? cardTag(item.event_date, "date") : ""
      ].filter(Boolean),
      points: [],
      ...(media.length > 0 ? { media } : {})
    };
  });
}

function builderOriginalBodyText(item) {
  const original = compactBuilderOriginalText(builderOriginalText(item));
  if (original) {
    return original;
  }
  return compactBuilderOriginalText(
    item?.content ||
    item?.text ||
    item?.summary ||
    item?.translation ||
    item?.translated_text ||
    ""
  );
}

function builderTranslationText(item) {
  const direct = String(item?.translation || item?.translated_text || item?.content || "").trim();
  if (direct) {
    return direct;
  }
  const original = builderOriginalText(item);
  if (containsChineseText(original)) {
    return original;
  }
  return builderOriginalFallbackSummary(original);
}

function builderDisplayName(item, handle = "") {
  const author = String(item?.author || item?.name || "").trim();
  if (author) {
    return author;
  }
  if (handle) {
    return handle;
  }
  try {
    return new URL(String(item?.url || "")).hostname.replace(/^www\./, "") || "X/Twitter 讨论";
  } catch {
    return "X/Twitter 讨论";
  }
}

function builderOriginalFallbackSummary(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase();
  if (!text) {
    return "这条 X/Twitter 讨论缺少可发布的正文摘要，已保留原帖入口供回看。";
  }
  const topics = [];
  if (/agent|agentic|autonomous/.test(lower)) topics.push("agent 工作流");
  if (/eval|benchmark|test|quality/.test(lower)) topics.push("评测和质量验证");
  if (/browser|playwright|web/.test(lower)) topics.push("浏览器自动化");
  if (/replay|screenshot|trace|log|observability/.test(lower)) topics.push("回放、截图或可观测性");
  if (/permission|security|sandbox|policy/.test(lower)) topics.push("权限和安全边界");
  if (/cost|token|routing|model/.test(lower)) topics.push("模型路由和成本控制");
  if (topics.length > 0) {
    return `原帖讨论${topics.slice(0, 3).join("、")}，已保留原文摘录，适合结合原帖上下文判断是否需要跟进。`;
  }
  return "原帖讨论 AI 产品或工程实践，已保留原文摘录，适合结合原帖上下文判断是否需要跟进。";
}

function builderOriginalText(item) {
  return String(item?.original_text || "").trim();
}

function compactBuilderOriginalText(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= 220) {
    return text;
  }
  return `${text.slice(0, 217).trim()}...`;
}

function formatBuilderMedia(report, item, options = {}) {
  const matchingAssets = Array.isArray(report?.evidence_assets)
    ? report.evidence_assets.filter((asset) =>
      normalizeEvidenceUrl(asset?.source_url) === normalizeEvidenceUrl(item?.url)
    )
    : [];
  const localMedia = formatCardMedia(report, matchingAssets, { limit: 2, ...options });
  if (localMedia.length > 0) {
    return localMedia;
  }

  const media = [];
  if (item?.image_url) {
    media.push({
      src: item.image_url,
      alt: item.image_alt || `${item.author || "Builder"} 原帖图片`,
      caption: item.image_alt || "原帖图片"
    });
  }
  for (const imageUrl of Array.isArray(item?.image_urls) ? item.image_urls : []) {
    media.push({
      src: imageUrl,
      alt: item.image_alt || `${item.author || "Builder"} 原帖图片`,
      caption: item.image_alt || "原帖图片"
    });
  }
  return normalizePublicMedia(media, 2);
}

function builderHandle(item) {
  const handle = String(item?.handle || "").trim().replace(/^@/, "");
  if (handle) {
    return handle;
  }
  try {
    const [, parsedHandle] = new URL(String(item?.url || "")).pathname.match(/^\/([^/]+)\/status\/\d+/i) || [];
    return String(parsedHandle || "").trim().replace(/^@/, "");
  } catch {
    return "";
  }
}

function builderAvatarIcon(report, item, options = {}) {
  if (item?.avatar_data_uri) {
    return item.avatar_data_uri;
  }
  const localPath = item?.avatar_local_path || inferredBuilderAvatarLocalPath(report, item, options);
  if (localPath && report?.html_path) {
    const assetRootDir = options.assetRootDir || "";
    const assetPath = assetRootDir ? path.join(assetRootDir, localPath) : "";
    if (!assetRootDir || fsSync.existsSync(assetPath)) {
      return relativeAssetHref(report.html_path, localPath);
    }
  }
  return generatedSiteIcon(siteInitials(item?.author || builderHandle(item) || "Builder"), "#111827", "#ffffff");
}

function inferredBuilderAvatarLocalPath(report, item, options = {}) {
  if (!report?.report_date || !item?.avatar_url || !options.assetRootDir) {
    return "";
  }
  try {
    const url = new URL(String(item.avatar_url || ""));
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    const [year, month] = String(report.report_date).split("-");
    if (!year || !month) {
      return "";
    }
    const handle = builderHandle(item) || item.author || "builder";
    const slug = String(handle)
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "builder";
    const extension = avatarExtensionFromUrl(url) || ".png";
    return `assets/avatars/${year}/${month}/${report.report_date}-${slug}${extension}`;
  } catch {
    return "";
  }
}

function avatarExtensionFromUrl(url) {
  const extension = path.extname(url.pathname || "").toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(extension) ? extension : "";
}

function hotBlogPointTexts(itemOrSummary) {
  const keyPoints = Array.isArray(itemOrSummary?.key_points)
    ? itemOrSummary.key_points
      .map((point) => stripPublicBodySourcePrefix(point, itemOrSummary).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .filter((point) => !isPublicBoilerplatePoint(point))
      .slice(0, 5)
    : [];
  if (keyPoints.length > 0) {
    return keyPoints;
  }
  const text = String(typeof itemOrSummary === "object" ? itemOrSummary?.summary : itemOrSummary || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return [];
  }
  const parts = text
    .split(/(?<=[\u3002\uff01\uff1f!?\uff1b;])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts.slice(0, 5) : [text];
}

function isPublicBoilerplatePoint(value) {
  const text = String(value || "").trim();
  return /(?:intermediary\/self-media lead|trace it to a primary source|backed by a primary source|discovery lead|verify with the original source)/i.test(text);
}

function editorialBullets(item) {
  return [
    item?.reader_relevance ? item.reader_relevance : "",
    hasNonPrimarySourceSignal(item) && item?.verification_note ? `核验：${item.verification_note}` : "",
    hasNonPrimarySourceSignal(item) && item?.risk_note ? `风险：${item.risk_note}` : ""
  ].filter(Boolean);
}

function editorialCardPoints(item, options = {}) {
  const includeReaderRelevance = options.includeReaderRelevance !== false;
  const includeWatchNext = options.includeWatchNext === true;
  const points = [];
  if (includeReaderRelevance && item?.reader_relevance) {
    points.push({ label: "关联", value: item.reader_relevance });
  }
  if (includeWatchNext && item?.watch_next) {
    points.push({ label: "后续", value: item.watch_next });
  }
  return points;
}

function hasNonPrimarySourceSignal(item = {}) {
  const sourceLevel = String(item?.source_level || "").trim();
  const status = String(item?.verification_status || "").trim();
  return Boolean(
    ["intermediary_only", "original_social_only", "unverified", "platform_exempt_unverified"].includes(status) ||
    (sourceLevel && !["primary", "official", "paper", "github", "multi_source"].includes(sourceLevel))
  );
}

function sourceLevelLabel(value) {
  const labels = {
    platform_exempt_signal: "平台豁免线索",
    primary: "已核查事实",
    official: "官方一手来源",
    paper: "论文/研究来源",
    github: "GitHub/仓库来源",
    multi_source: "已核查事实",
    intermediary: "第三方报道",
    community: "社区线索",
    original_social: "原始社交动态",
    unverified: "社区线索",
    wechat_primary_like: "官方一手来源",
    wechat_industry_whitelist: "第三方报道",
    weekly_paper_aggregator: "论文周报聚合",
    open_source_aggregator: "开源聚合",
    tech_weekly_aggregator: "第三方报道",
    paper_api: "论文 API",
    community_api: "社区线索",
    paper_aggregator: "论文聚合",
    ai_news_aggregator: "第三方报道",
    aigc_content_industry: "第三方报道",
    ai_funding_product_radar: "第三方报道"
  };
  return labels[value] || String(value || "").trim();
}

function sourceTrustLabel(item = {}) {
  const sourceLevel = String(item?.source_level || "").trim();
  const status = String(item?.verification_status || "").trim();
  const sourceText = `${item?.source || ""} ${item?.url || ""}`.toLowerCase();
  if (status === "multi_source_confirmed" || sourceLevel === "multi_source") return "已核查事实";
  if (sourceLevel === "official" || sourceLevel === "official_company_news" || sourceLevel === "official_open_source_account" || sourceLevel === "official_model_host_account") return "官方一手来源";
  if (status === "primary_confirmed" || sourceLevel === "primary") return "已核查事实";
  if (sourceLevel === "paper" || sourceLevel === "paper_api") return "论文/研究来源";
  if (sourceLevel === "github") return "GitHub/仓库来源";
  if (sourceLevel === "original_social" || status === "original_social_only") return "原始社交动态";
  if (sourceLevel === "platform_exempt_signal" || status === "platform_exempt_unverified") return "平台线索";
  if (status === "intermediary_only" || isThirdPartySourceLevel(sourceLevel)) return "第三方报道";
  if (status === "unverified" || sourceLevel === "community" || sourceLevel === "community_api") return "社区线索";
  if (sourceText.includes("github.com") || sourceText.includes("github trending")) return "GitHub/仓库来源";
  if (sourceText.includes("x.com/") || sourceText.includes("twitter.com/")) return "原始社交动态";
  return sourceLevelLabel(sourceLevel);
}

function isThirdPartySourceLevel(value) {
  return [
    "intermediary",
    "wechat_industry_whitelist",
    "weekly_paper_aggregator",
    "open_source_aggregator",
    "tech_weekly_aggregator",
    "paper_aggregator",
    "ai_news_aggregator",
    "aigc_content_industry",
    "ai_funding_product_radar"
  ].includes(String(value || "").trim());
}

function sourceTrustKind(item = {}) {
  const label = sourceTrustLabel(item);
  if (["第三方报道", "社区线索", "平台线索"].includes(label)) return "risk";
  return "source";
}

function sourceTrustCardTag(item = {}) {
  return "";
}

function sourceTrustHighlightTag(item = {}) {
  return "";
}

function formatCardMedia(report, assets, options = {}) {
  if (!report || !Array.isArray(assets) || assets.length === 0) {
    return [];
  }

  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 2;

  return normalizePublicMedia(assets
    .filter((asset) => asset?.local_path && isPublicContentMediaAsset(report, asset, options))
    .map((asset) => ({
      src: publicAssetHref(report, asset.local_path),
      alt: asset.title || "",
      caption: evidenceCaption(asset)
    })), limit);
}

function formatCardMediaForItem(report, item, assets, options = {}) {
  const localMedia = formatCardMedia(report, assets, options);
  if (localMedia.length > 0) {
    return localMedia;
  }

  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 2;
  const media = [];
  if (item?.image_url) {
    media.push({
      src: item.image_url,
      alt: item.image_alt || item.title || "",
      caption: item.image_alt || item.title || "原文图片"
    });
  }
  for (const imageUrl of Array.isArray(item?.image_urls) ? item.image_urls : []) {
    media.push({
      src: imageUrl,
      alt: item.image_alt || item.title || "",
      caption: item.image_alt || item.title || "原文图片"
    });
  }

  return normalizePublicMedia(media, limit);
}

function isPublicRenderableEvidenceAsset(report, asset, options = {}) {
  if (!asset) {
    return false;
  }
  if (asset.local_path) {
    return isPublicContentMediaAsset(report, asset, options);
  }
  return Array.isArray(asset.data) && asset.data.length > 0;
}

function isPublicContentMediaAsset(report, asset, options = {}) {
  if (!asset?.local_path) {
    return false;
  }
  if (isNonContentMediaAsset(asset) || isFullPageScreenshotMediaAsset(asset)) {
    return false;
  }
  const dimensions = knownMediaDimensions(report, asset, options);
  if (dimensions && isTooSmallPublicMedia(dimensions)) {
    return false;
  }
  return true;
}

function isNonContentMediaAsset(asset) {
  const role = String(asset?.asset_role || asset?.role || "").trim().toLowerCase();
  if (NON_CONTENT_MEDIA_ROLES.has(role)) {
    return true;
  }
  const text = mediaAssetText(asset);
  return /\b(?:favicon|logo|avatar|icon)\b|图标|头像|徽标/u.test(text);
}

function isFullPageScreenshotMediaAsset(asset) {
  const captureKind = String(asset?.capture_kind || asset?.capture_type || "").trim().toLowerCase();
  if (captureKind === "full_page_screenshot" || captureKind === "page_screenshot" || captureKind === "browser_screenshot") {
    return true;
  }
  return /\b(?:full[- ]?page|browser|viewport|page)\s+screenshot\b|页面截图|整页截图|浏览器截图/u.test(mediaAssetText(asset));
}

function mediaAssetText(asset) {
  return [
    asset?.title,
    asset?.caption,
    asset?.local_path,
    asset?.extraction_status
  ].map((value) => String(value || "").toLowerCase()).join(" ");
}

function knownMediaDimensions(report, asset, options = {}) {
  const width = Number(asset?.width || asset?.natural_width);
  const height = Number(asset?.height || asset?.natural_height);
  if (Number.isFinite(width) && Number.isFinite(height)) {
    return { width, height };
  }
  const filePath = resolveLocalAssetPath(report, asset?.local_path, options);
  if (!filePath) {
    return null;
  }
  return readImageDimensions(filePath);
}

function isTooSmallPublicMedia({ width, height }) {
  return width < PUBLIC_MEDIA_MIN_WIDTH ||
    height < PUBLIC_MEDIA_MIN_HEIGHT ||
    width * height < PUBLIC_MEDIA_MIN_AREA;
}

function resolveLocalAssetPath(report, localPath, options = {}) {
  const normalized = String(localPath || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    return "";
  }
  if (options.assetRootDir) {
    return path.resolve(options.assetRootDir, normalized);
  }
  if (options.rootDir) {
    return path.resolve(options.rootDir, "docs", normalized);
  }
  const htmlPath = String(report?.html_path || "").trim();
  if (htmlPath) {
    return path.resolve(process.cwd(), "docs", normalized);
  }
  return "";
}

function readImageDimensions(filePath) {
  try {
    const buffer = fsSync.readFileSync(filePath);
    if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
      };
    }
    if (buffer.length >= 10 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
      return readWebpDimensions(buffer);
    }
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      return readJpegDimensions(buffer);
    }
  } catch {
    return null;
  }
  return null;
}

function readWebpDimensions(buffer) {
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  return null;
}

function readJpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) {
      return null;
    }
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }
    offset += 2 + length;
  }
  return null;
}

function publicAssetHref(report, localPath) {
  const htmlPath = String(report?.html_path || "").trim();
  if (!htmlPath) {
    return String(localPath || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  }
  return relativeAssetHref(htmlPath, localPath);
}

function normalizePublicMedia(entries, limit) {
  const seen = new Set();
  return entries
    .filter((entry) => {
      const src = String(entry?.src || "").trim();
      if (!isPublicRenderableMediaSrc(src) || seen.has(src)) {
        return false;
      }
      seen.add(src);
      return true;
    })
    .slice(0, limit);
}

function isPublicRenderableMediaSrc(src) {
  const value = String(src || "").trim();
  if (!value) {
    return false;
  }
  if (/^data:/i.test(value)) {
    return true;
  }
  if (/^(?:https?:)?\/\//i.test(value)) {
    return false;
  }
  return true;
}

function hotBlogTags(item) {
  const topic = String(item.topic || "").trim();
  if (!topic) {
    return [];
  }
  return [...new Set(topic.split(/[、,，/|]+/).map((tag) => tag.trim()).filter(Boolean))];
}

function mainItemIconFor(item) {
  return item.source_icon || item.source_icon_data_uri || sourceIconForName(item.source) || siteIconForUrl(item.url, item.source);
}

function mainItemTitle(item) {
  const source = String(item.source || "").trim();
  const title = String(item.title || "").trim();
  return stripSourcePrefix(title, source);
}

function stripSourcePrefix(title, source) {
  const text = String(title || "").trim();
  const sourceText = String(source || "").trim();
  if (!sourceText) {
    return text;
  }
  const escapedSource = escapeRegex(sourceText);
  return text
    .replace(new RegExp(`^(?:\\*\\*)?${escapedSource}(?:\\*\\*)?\\s*[：:｜|\\-—–]?\\s*`, "i"), "")
    .trim() || text;
}

function stripPublicBodySourcePrefix(value, item = {}) {
  let text = String(value || "").trim();
  if (!text) {
    return "";
  }
  for (const source of publicBodySourceLabels(item)) {
    text = stripPublicBodyExactSourcePrefix(text, source);
  }
  const withoutKnownPrefix = text.replace(PUBLIC_BODY_SOURCE_PREFIX_RE, "").trim();
  if (withoutKnownPrefix) {
    text = withoutKnownPrefix;
  }
  return text
    .replace(/\s*。?\s*Treat this as a community lead unless it is backed by a primary source\.?/gi, "")
    .replace(/\s*This is an intermediary\/self-media lead; trace it to a primary source before[^。.;\n]*(?:[。.;]|$)/gi, "")
    .replace(/\s*[A-Za-z][A-Za-z0-9 .&/_'()-]{1,60}\s+latest report listed this entry; use it as a discovery lead and verify with the original source before factual inclusion\.?/gi, "")
    .replace(/\s*(?:待确认|边界)\s*[：:][^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*(?:该来源|中介来源|事实性结论|事实来自|官方文档)[^。；;\n]*(?:仅作为?线索|仅作(?:发现|社区)?线索|需要一手|多源确认|原始链接|不得仅凭该线索写入主体)[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/[；;]?\s*当前作为[^。；;\n]*(?:线索|观察)[^。；;\n]*(?:确认|。|$)/g, "")
    .replace(/[；;]?\s*这是[^。；;\n]*(?:线索|观察)[^。；;\n]*(?:不进入|未进入)[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*(?:不进入|未进入)\s*AI\s*主体事实[。；;]?/g, "")
    .trim();
}

function stripCommunityLeadFallbackBoilerplate(value, item = {}) {
  let text = String(value || "").trim();
  if (!text) {
    return "";
  }
  for (const source of publicBodySourceLabels(item)) {
    text = stripPublicBodyExactSourcePrefix(text, source);
  }
  const verificationNote = String(item?.verification_note || "").trim();
  if (verificationNote) {
    text = text.replace(verificationNote, "").trim();
  }
  return text
    .replace(/\s*。?\s*Treat this as a community lead unless it is backed by a primary source\.?/gi, "")
    .replace(/\s*(?:待确认|边界)\s*[：:][^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/[；;]?\s*当前作为[^。；;\n]*(?:线索|观察)[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/[；;]?\s*等待官方[^。；;\n]*(?:确认|核实|产品页确认)?[。；;]?/g, "")
    .replace(/\s*中介来源[^。；;\n]*(?:[。；;]|$)/g, "")
    .replace(/\s*事实性结论需要一手或多源确认[。；;]?/g, "")
    .trim();
}

function stripPublicBodyExactSourcePrefix(value, source) {
  const text = String(value || "").trim();
  const sourceText = String(source || "").trim();
  if (!sourceText) {
    return text;
  }
  const escapedSource = escapeRegex(sourceText);
  return text
    .replace(new RegExp(`^(?:\\*\\*)?${escapedSource}(?:\\*\\*)?\\s*[：:]\\s*`, "i"), "")
    .trim() || text;
}

function stripSentenceEnding(value) {
  return String(value || "")
    .trim()
    .replace(/[。！？!?；;:：]+$/u, "");
}

function publicBodySourceLabels(item = {}) {
  return [
    item.source,
    item.publisher,
    item.source_name,
    item.source_title
  ].map((value) => String(value || "").trim()).filter(Boolean);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatHighlightTags(tags) {
  const markers = [];
  const seen = new Set();
  for (const tag of tags) {
    const marker = highlightTagMarker(tag);
    if (!marker || seen.has(marker)) {
      continue;
    }
    seen.add(marker);
    markers.push(marker);
  }
  return markers.length > 0 ? ` ${markers.map((marker) => `==${marker}==`).join(" ")}` : "";
}

function highlightTagMarker(tag) {
  const text = String(tag || "").trim();
  if (!text) {
    return "";
  }
  if (/^trend-(?:new|up|down|same)\|/.test(text) || /^tag-[a-z0-9-]+\|/.test(text)) {
    return text;
  }
  const importance = importanceClassFromLabel(text);
  if (importance) {
    return `tag-${importance}|${text}`;
  }
  if (/stars?/i.test(text)) {
    return `tag-stars|${text}`;
  }
  if (/highlight|高亮|项目/.test(text)) {
    return `tag-highlight|${text}`;
  }
  return `tag-topic|${text}`;
}

function cardTag(label, forcedKind = "") {
  const text = String(label || "").trim();
  if (!text) {
    return "";
  }
  const kind = forcedKind || importanceClassFromLabel(text) || (/stars?/i.test(text) ? "stars" : "");
  return kind ? `${kind}|${text}` : text;
}

function importanceClassFromLabel(label) {
  const text = String(label || "").trim();
  if (text === "重大") return "major";
  if (text === "值得关注") return "notable";
  if (text === "一般") return "general";
  return "";
}

function importanceTagFor(sectionName, item) {
  return importanceTag(item) || importanceLabel(defaultImportanceForSection(sectionName, item));
}

function formatDailyInlineText(value, item = {}) {
  const kind = normalizeImportance(item.importance) || "notable";
  return stripPublicBodySourcePrefix(value, item).replace(/==([^=\n]+)==/g, (_match, text) => {
    const inner = String(text || "").trim();
    if (/^(?:keyword|tag|trend)-/.test(inner)) {
      return `==${inner}==`;
    }
    return `==keyword-${kind}|${inner}==`;
  });
}

function formatTwitterDiscussion(items, auditGroup, options = {}) {
  if (items.length > 0) {
    const content = items
      .map((item) => {
        const details = formatNestedEditorialDetails(item);
        const line = `- **${item.author}**${formatHighlightTags([importanceTagFor("builder_observations", item)].filter(Boolean))}${item.role ? `（${item.role}）` : ""}：${formatDailyInlineText(item.content, item)} ${markdownLink(item.url, item.source || "X/Twitter")}`;
        return details ? `${line}\n${details}` : line;
      })
      .join("\n");
    return options.includeHeading ? `### X/Twitter 讨论\n\n${content}` : content;
  }

  if (!auditGroup?.checked) {
    return "";
  }

  const checkedSources = Array.isArray(auditGroup.sources)
    ? auditGroup.sources
        .map((source) => `${source.name || "未知来源"}:${source.status || "unknown"}${source.notes ? `（${source.notes}）` : ""}`)
        .join("；")
    : "未记录具体来源";
  const reason = auditGroup.blocked_reason || auditGroup.notes || "未入选近期原始 X/Twitter status。";
  const content = `- **降级说明**：本轮已检查 X/Twitter 相关来源，但未形成可入选的原始 status 条目。原因：${reason}\n- **检查来源**：${checkedSources}`;
  return options.includeHeading ? `### X/Twitter 讨论\n\n${content}` : content;
}

function formatCommunityLeadCards(items, context = {}) {
  const leads = items.filter((item) => !isLowSignalStatuspageLead(item));
  return leads.map((item) => {
    const body = communityLeadBody(item);
    if (!isPublishableCommunityLeadBody(body, item)) {
      return null;
    }
    const media = formatCardMediaForItem(context.report, item, evidenceForUrl(context.evidenceByUrl, item.url), {
      limit: 2,
      ...(context.mediaOptions || {})
    });
    return {
      group: item.source || sourceLevelLabel(item.source_level) || "社区线索",
      title: communityLeadTitle(item),
      href: item.url,
      titleIcon: mainItemIconFor(item),
      body: formatDailyInlineText(body, item),
      showGroup: false,
      tags: [
        cardTag(importanceTagFor("community_leads", item)),
        sourceTrustCardTag(item),
        item.event_date ? cardTag(item.event_date, "date") : ""
      ].filter(Boolean),
      points: [],
      ...(media.length > 0 ? { media } : {})
    };
  }).filter(Boolean);
}

function formatPlatformExemptCards(items, sectionName, context = {}) {
  const platform = platformForSection(sectionName);
  return (Array.isArray(items) ? items : []).map((item) => {
    const media = formatCardMediaForItem(context.report, item, evidenceForUrl(context.evidenceByUrl, item.url), {
      limit: 1,
      ...(context.mediaOptions || {})
    });
    const body = platformCardBody(item, platform);
    return {
      group: item.source || platformItemLabel(platform),
      title: platformCardTitle(item, platform),
      href: item.url,
      titleIcon: siteIconForUrl(item.url, item.source || platformItemLabel(platform)),
      body: formatDailyInlineText(body, item),
      showGroup: false,
      tags: [
        cardTag(importanceTagFor(sectionName, item)),
        cardTag(platformItemLabel(platform), "topic"),
        item.event_date ? cardTag(item.event_date, "date") : ""
      ].filter(Boolean),
      points: [
        item.disclosure ? { label: "公开披露", value: item.disclosure } : null
      ].filter(Boolean),
      ...(media.length > 0 ? { media } : {})
    };
  });
}

function platformCardTitle(item, platform) {
  const originalTitle = platformOriginalTitle(item);
  const text = `${originalTitle} ${item?.claim_text || ""} ${item?.summary || ""}`;
  if (/xiaomi|mimo|1,?000\+?\s*(?:tps|tokens?\/sec)|1t model|8-gpu/i.test(text)) {
    return "Reddit 讨论小米 1T MoE 模型 1000+ tokens/sec 声称";
  }
  if (/gemma.*4[-\s]?bit.*qat|4[-\s]?bit.*qat.*8[-\s]?bit|benchmark/i.test(text)) {
    return "Reddit 讨论 Gemma 4-bit QAT 与 8-bit PTQ benchmark";
  }
  if (containsChineseText(originalTitle) && !isGeneratedPlatformTitle(originalTitle)) {
    return trimText(originalTitle, 90);
  }
  return `${platformItemLabel(platform)}：${trimText(originalTitle || item?.source || "平台讨论线索", 80)}`;
}

function platformCardBody(item, platform) {
  const raw = String(item?.claim_text || item?.summary || item?.title || "").replace(/\s+/g, " ").trim();
  const originalTitle = platformOriginalTitle(item);
  const text = `${originalTitle} ${raw}`;
  if (/xiaomi|mimo|1,?000\+?\s*(?:tps|tokens?\/sec)|1t model|8-gpu/i.test(text)) {
    return "原帖讨论小米 MiMo-V2.5-Pro UltraSpeed 声称在标准 8-GPU 节点上让 1T MoE 模型达到 1000+ tokens/sec 输出。";
  }
  if (/gemma.*4[-\s]?bit.*qat|4[-\s]?bit.*qat.*8[-\s]?bit|benchmark/i.test(text)) {
    return "原帖在找 Gemma 4-bit QAT 与传统 8-bit PTQ 量化的直接 benchmark，重点是准确率和速度是否有硬数据对比。";
  }
  if (containsChineseText(raw) && !isGeneratedPlatformTitle(raw)) {
    return trimText(raw, 180);
  }
  return trimText(originalTitle || raw, 180);
}

function platformOriginalTitle(item) {
  const raw = String(item?.title || "").replace(/\s+/g, " ").trim();
  const quoted = raw.match(/原文标题为[“"]([^”"]+)/u);
  if (quoted?.[1]) {
    return stripTrailingEllipsis(quoted[1]);
  }
  return stripTrailingEllipsis(raw);
}

function stripTrailingEllipsis(value) {
  return String(value || "").replace(/\s*\.\.\.$/u, "").trim();
}

function isGeneratedPlatformTitle(value) {
  return /发布了一条 AI 相关更新|原文标题为|Platform Feed/i.test(String(value || ""));
}

function containsChineseText(value) {
  return /\p{Script=Han}/u.test(String(value || ""));
}

function summarizeCommunityLeadBody(text, title) {
  const originalBody = String(text || "").trim();
  if (!originalBody) {
    return "";
  }
  let body = originalBody;
  if (title && body.startsWith(title)) {
    body = body.slice(title.length).replace(/^[，,；;：:\s]+/u, "").trim();
    if (!body.replace(/[。！？!?；;，,：:\s]+/gu, "")) {
      return trimText(originalBody, 160);
    }
  }
  const sentences = body
    .split(/(?<=[。！？!?；;])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (sentences.length === 0) {
    return trimText(originalBody, 160);
  }
  const picked = [];
  let visibleLength = 0;
  for (const sentence of sentences) {
    picked.push(sentence);
    visibleLength += sentence.length;
    if (picked.length >= 2 || visibleLength >= 140) {
      break;
    }
  }
  return trimText(picked.join(" "), 160);
}

function communityLeadBody(item) {
  const primaryBody = stripPublicBodySourcePrefix(item?.content || "", item);
  const rawBody = String(item?.content || "").trim();
  if (!primaryBody && !rawBody) {
    return "";
  }
  const title = stripSentenceEnding(stripPublicBodySourcePrefix(communityLeadTitle(item), item));
  const summarizedPrimaryBody = summarizeCommunityLeadBody(primaryBody, title);
  const cleanedPrimaryBody = stripCommunityLeadFallbackBoilerplate(summarizedPrimaryBody, item);
  if (isReaderFacingChineseBody(cleanedPrimaryBody)) {
    return trimText(cleanedPrimaryBody, 220);
  }
  const fallbackBody = stripCommunityLeadFallbackBoilerplate(rawBody, item);
  const summarizedFallbackBody = summarizeCommunityLeadBody(fallbackBody, title);
  if (isReaderFacingChineseBody(summarizedFallbackBody)) {
    return trimText(summarizedFallbackBody, 220);
  }
  return trimText(cleanedPrimaryBody || summarizedFallbackBody || fallbackBody || primaryBody || rawBody, 220);
}

function expandCommunityLeadBody(value, item = {}, title = "") {
  const initial = stripCommunityLeadFallbackBoilerplate(value, item).replace(/\s+/g, " ").trim();
  if (!initial) {
    return "";
  }
  const fragments = [stripSentenceEnding(initial)];
  const source = String(item?.source || item?.publisher || "").trim();
  const eventDate = String(item?.event_date || "").trim();
  const cleanTitle = stripSentenceEnding(stripPublicBodySourcePrefix(title || item?.title || "", item));
  if (cleanTitle && !isNearDuplicateText(cleanTitle, initial)) {
    fragments.push(`这条内容围绕「${cleanTitle}」展开`);
  }
  if (source || eventDate) {
    fragments.push(communityLeadSourceContext(source, eventDate));
  }
  const relevance = stripCommunityLeadFallbackBoilerplate(item?.reader_relevance || "", item);
  if (relevance && !isNearDuplicateText(relevance, fragments.join(" "))) {
    fragments.push(stripSentenceEnding(relevance));
  } else {
    fragments.push(communityLeadDefaultReaderContext(cleanTitle || initial));
  }
  return trimText(`${uniqueTextFragments(fragments).join("；")}。`, 240);
}

function communityLeadSourceContext(source, eventDate) {
  const sourceLabel = source || "公开来源";
  return `${sourceLabel}${eventDate ? `在 ${eventDate}` : ""}记录了这条内容，公开信息仍应和官方公告、产品页或技术材料对照阅读`;
}

function communityLeadDefaultReaderContext(value) {
  const topic = communityLeadTopicLabel(value);
  return `读者可以把它当作${topic}的早期动态来看，重点关注涉及的产品入口、能力说明、应用场景和后续可复核材料，而不是只看传播热度`;
}

function communityLeadTopicLabel(value) {
  const text = String(value || "");
  if (/机器人|具身|Qwen-Robot|Robot/i.test(text)) {
    return "具身智能和机器人产品线";
  }
  if (/AI\s*助手|小艺|手机|终端|桌面|Display/i.test(text)) {
    return "终端 AI 助手和人机交互";
  }
  if (/大赛|创造力|赛事|开发者/i.test(text)) {
    return "AI 创作活动和开发者生态";
  }
  if (/Agent|搜索|工具|工作流/i.test(text)) {
    return "agent 工具和自动化工作流";
  }
  if (/GPU|vGPU|算力|平台|基准|模型/i.test(text)) {
    return "AI 基础设施、模型或平台";
  }
  return "AI 产品、平台或产业动态";
}

function isReaderFacingChineseBody(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return false;
  }
  const textWithoutUrls = text.replace(/https?:\/\/\S+/gi, "").trim();
  const chineseChars = (text.match(/\p{Script=Han}/gu) || []).length;
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  const ratioBase = chineseChars + latinChars;
  const chineseRatio = ratioBase > 0 ? chineseChars / ratioBase : 0;
  const longEnglishRun = /[A-Za-z@][A-Za-z0-9 @_,;:'"()[\]\/.!?+~`#-]{60,}/.test(textWithoutUrls);
  return chineseChars >= 10 && chineseRatio >= 0.35 && !longEnglishRun;
}

function isPublishableCommunityLeadBody(value, item = {}) {
  if (isReaderFacingChineseBody(value)) {
    return true;
  }
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || !item?.url) {
    return false;
  }
  const textWithoutUrls = text.replace(/https?:\/\/\S+/gi, "").trim();
  const chineseChars = (text.match(/\p{Script=Han}/gu) || []).length;
  const longEnglishRun = /[A-Za-z@][A-Za-z0-9 @_,;:'"()[\]\/.!?+~`#-]{60,}/.test(textWithoutUrls);
  if (chineseChars >= 4 && text.length >= 18 && !longEnglishRun) {
    return true;
  }
  return Boolean(item?.source || item?.source_level || item?.publisher) && text.length >= 18;
}

function shouldPreferCommunityLeadBodyTitle(title, fallbackTitle) {
  if (!fallbackTitle) {
    return false;
  }
  const text = String(title || "").replace(/https?:\/\/\S+/gi, "").trim();
  if (!text) {
    return true;
  }
  const chineseChars = (text.match(/\p{Script=Han}/gu) || []).length;
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  const ratioBase = chineseChars + latinChars;
  const chineseRatio = ratioBase > 0 ? chineseChars / ratioBase : 0;
  const longEnglishRun = /[A-Za-z@][A-Za-z0-9 @_,;:'"()[\]\/.!?+~`#-]{40,}/.test(text);
  return chineseChars < 8 && (longEnglishRun || chineseRatio < 0.2);
}

function communityLeadBodyTitle(item) {
  const body = stripPublicBodySourcePrefix(item?.content || "", item);
  if (!isReaderFacingChineseBody(body)) {
    return "";
  }
  const firstSentence = body.split(/(?<=[。！？!?；;])\s*/u).find(Boolean) || body;
  const firstClause = firstSentence.split(/[；;。！？!?]/u).find(Boolean) || firstSentence;
  return stripSentenceEnding(trimText(firstClause, 60));
}

function formatNestedEditorialDetails(item) {
  return editorialBullets(item)
    .map((bullet) => `  - ${bullet}`)
    .join("\n");
}

function communityLeadTitle(item) {
  const title = stripPublicBodySourcePrefix(item?.title || "", item);
  const bodyTitle = communityLeadBodyTitle(item);
  if (shouldPreferCommunityLeadBodyTitle(title, bodyTitle)) {
    return bodyTitle;
  }
  if (title) {
    return title;
  }
  const source = String(item?.source || item?.publisher || "").trim();
  if (source) {
    return source;
  }
  if (bodyTitle) {
    return bodyTitle;
  }
  try {
    return new URL(String(item?.url || "")).hostname.replace(/^www\./, "");
  } catch {
    return "社区线索";
  }
}

function signalSectionTitle(builderSection, communitySection) {
  if (builderSection && communitySection) {
    return "X/Twitter 讨论与社区线索";
  }
  return builderSection ? "X/Twitter 讨论" : "社区线索";
}

function isLowSignalStatuspageLead(item) {
  const content = String(item?.content || "").toLowerCase();
  const url = String(item?.url || "");
  if (!isStatuspageUrl(url)) {
    return false;
  }

  return /elevated errors|resolved|troubleshooting|incident|degraded|outage|error rate|\berrors\b|排障|故障|已恢复|已解决|标记 resolved/i.test(content);
}

function isStatuspageUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.startsWith("status.") || hostname.includes("statuspage");
  } catch {
    return false;
  }
}

function evidenceAssetsBySourceUrl(assets) {
  const grouped = new Map();
  for (const asset of assets) {
    const key = normalizeEvidenceUrl(asset?.source_url);
    if (!key || !hasRenderableEvidence(asset)) {
      continue;
    }
    const current = grouped.get(key) || [];
    if (!current.some((existing) => evidenceAssetIdentity(existing) === evidenceAssetIdentity(asset))) {
      current.push(asset);
    }
    grouped.set(key, current);
  }
  return grouped;
}

function evidenceAssetIdentity(asset) {
  return asset?.local_path || `${asset?.title || ""}:${JSON.stringify(asset?.data || [])}`;
}

function evidenceForUrl(evidenceByUrl, url) {
  if (!evidenceByUrl || typeof evidenceByUrl.get !== "function") {
    return [];
  }
  return evidenceByUrl.get(normalizeEvidenceUrl(url)) || [];
}

function normalizeEvidenceUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim().replace(/\/$/, "");
  }
}

function hasRenderableEvidence(asset) {
  return Boolean(asset && (asset.local_path || (Array.isArray(asset.data) && asset.data.length > 0)));
}

function formatInlineEvidenceAssets(report, assets, options = {}) {
  if (!report || !Array.isArray(assets) || assets.length === 0) {
    return "";
  }

  const renderableAssets = assets
    .filter((asset) => isPublicRenderableEvidenceAsset(report, asset, options))
    .slice(0, 2);
  if (renderableAssets.length === 2 && renderableAssets.every((asset) => asset?.local_path)) {
    const imageLine = renderableAssets
      .map((asset) => markdownImage(publicAssetHref(report, asset.local_path), asset.title))
      .filter(Boolean)
      .join(" ");
    const captionLine = renderableAssets
      .map((asset, index) => `${index + 1}. ${evidenceCaption(asset)}`)
      .join(" / ");
    return [imageLine, `*${captionLine}*`].filter(Boolean).join("\n\n");
  }

  return renderableAssets
    .map((asset) => formatInlineEvidenceAsset(report, asset))
    .filter(Boolean)
    .join("\n\n");
}

function formatInlineEvidenceAsset(report, asset) {
  const caption = evidenceCaption(asset);
  if (asset.local_path) {
    return [
      markdownImage(publicAssetHref(report, asset.local_path), asset.title),
      `*${caption}*`
    ].join("\n\n");
  }
  const table = formatEvidenceTable(asset.data);
  if (table) {
    return [table, `*${caption}*`].join("\n\n");
  }
  return "";
}

function evidenceCaption(asset) {
  const title = String(asset.title || "").trim();
  const caption = String(asset.caption || "").trim();
  if (!caption || caption === title) {
    return title;
  }
  return title ? `${title}：${caption}` : caption;
}

function formatEvidenceTable(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0])) {
    return "";
  }

  const header = rows[0].map((cell) => escapeMarkdownTableCell(cell));
  const body = rows.slice(1).filter(Array.isArray);
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.map((cell) => escapeMarkdownTableCell(cell)).join(" | ")} |`)
  ].join("\n");
}

function formatSourceAudit(audit) {
  if (!audit) {
    return "未记录信源审计。";
  }

  return [
    formatAuditGroup("GitHub Trending", audit.github_trending),
    formatAuditGroup("Builder 原始源", audit.builder_sources),
    audit.content_sources ? formatAuditGroup("精选博客与访谈源", audit.content_sources) : "",
    audit.search_sources ? formatAuditGroup("搜索 / 新闻影子源", audit.search_sources) : "",
    audit.sources_health ? formatAuditGroup("信源健康检查", audit.sources_health) : "",
    audit.wechat_sources ? formatAuditGroup(platformItemLabel("wechat"), audit.wechat_sources) : "",
    audit.zhihu_sources ? formatAuditGroup(platformItemLabel("zhihu"), audit.zhihu_sources) : "",
    audit.reddit_sources ? formatAuditGroup(platformItemLabel("reddit"), audit.reddit_sources) : ""
  ].filter(Boolean).join("\n\n");
}

function formatSourceSignalStorySection(rows = [], options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const metrics = sourceFirstMetrics(rows);
  const inventoryMetrics = sourceInventoryRuntimeMetrics(options.sourceInventoryRows);
  const validSignals = metrics.included + metrics.updatedNotSelected;
  const storyTitles = sourceSignalStoryTitles(options.stories, options.mainItems);
  const includedNames = sourceSignalSourceNames(rows, (row) => row.status_label === "included", 4);
  const updatedNames = sourceSignalSourceNames(rows, (row) => row.status_label === "updated_not_selected", 3);
  const blockedNames = sourceSignalSourceNames(rows, (row) => row.status_label === "blocked", 3);
  const skippedNames = sourceSignalSourceNames(rows, (row) => row.status_label === "not_configured_or_skipped", 3);
  const lowSignalNames = sourceSignalSourceNames(rows, (row) =>
    row.status_label === "no_recent_update" || row.status_label === "parsed_not_candidate",
  3);
  const noSignalCount = metrics.noRecentUpdate + metrics.parsedNotCandidate;
  return {
    type: "filterable-cards",
    title: "今日信源故事",
    richId: "source-signal-story",
    group: "main",
    collapsed: false,
    cardClass: "source-signal-story-card",
    showFilters: false,
    summary: [
      `${validSignals}/${metrics.total} 个逻辑信源提供有效公开信号；阻塞 ${metrics.blocked}，未配置或跳过 ${metrics.skipped}。`,
      sourceInventoryRuntimeSummary(inventoryMetrics)
    ].filter(Boolean).join(" "),
    content: sourceSignalStoryMarkdown({
      metrics,
      inventoryMetrics,
      validSignals,
      noSignalCount,
      storyTitles,
      includedNames,
      updatedNames,
      blockedNames,
      skippedNames
    }),
    items: sourceSignalStoryCards({
      metrics,
      inventoryMetrics,
      validSignals,
      noSignalCount,
      storyTitles,
      includedNames,
      updatedNames,
      blockedNames,
      skippedNames,
      lowSignalNames
    })
  };
}

function sourceSignalStoryMarkdown({
  metrics,
  inventoryMetrics = {},
  validSignals,
  noSignalCount,
  storyTitles = [],
  includedNames = [],
  updatedNames = [],
  blockedNames = [],
  skippedNames = []
} = {}) {
  return [
    "### 今日信源故事",
    "",
    `今天可用于公开叙事的有效信源为 ${validSignals}/${metrics.total}；公开入选 ${metrics.included}/${metrics.total}，有更新未入选 ${metrics.updatedNotSelected}，低信号 ${noSignalCount}，阻塞 ${metrics.blocked}，未配置或跳过 ${metrics.skipped}。`,
    sourceInventoryRuntimeSummary(inventoryMetrics)
      ? `全量信源入口：${sourceInventoryRuntimeSummary(inventoryMetrics)}。`
      : "",
    storyTitles.length > 0
      ? `今日主线来自这些可见 story：${storyTitles.map(escapeMarkdownText).join("；")}。`
      : "今日没有足够清晰的公开 story，本页保留信源运行状态，不强行扩写。",
    includedNames.length > 0
      ? `有效信源：${includedNames.map(escapeMarkdownText).join("、")}。`
      : "有效信源：今天没有信源进入公开页。",
    updatedNames.length > 0
      ? `旁路更新：${updatedNames.map(escapeMarkdownText).join("、")} 有更新但未进入公开页。`
      : "旁路更新：今天没有额外的有更新未入选信源。",
    sourceSignalGapSentence(blockedNames, skippedNames, metrics),
    "",
    "继续查看：[信源运行概况](#section-source-first-dashboard) · [状态焦点](#section-source-status-focus) · [全量信源清单](#section-source-inventory)"
  ].filter(Boolean).join("\n");
}

function sourceSignalStoryCards({
  metrics,
  inventoryMetrics = {},
  validSignals,
  noSignalCount,
  storyTitles = [],
  includedNames = [],
  updatedNames = [],
  blockedNames = [],
  skippedNames = [],
  lowSignalNames = []
} = {}) {
  return [
    sourceSignalStoryCard({
      title: "有效信源主线",
      subtitle: "story first",
      href: "#section-source-first-dashboard",
      titleIcon: generatedSiteIcon("S1", "#0f766e", "#ffffff"),
      tags: [
        { label: "source story", kind: "major" },
        { label: "metrics next", kind: "general" }
      ],
      stats: [
        { label: "有效信源", value: `${validSignals}/${metrics.total}` },
        { label: "公开入选", value: `${metrics.included}/${metrics.total}` },
        { label: "有更新未入选", value: String(metrics.updatedNotSelected) },
        { label: "低信号", value: String(noSignalCount) },
        { label: "阻塞", value: String(metrics.blocked) },
        { label: "未配置或跳过", value: String(metrics.skipped) },
        ...(inventoryMetrics.total ? [
          { label: "全量入口", value: String(inventoryMetrics.total) },
          { label: "入口运行态", value: `${inventoryMetrics.known}/${inventoryMetrics.total}` }
        ] : [])
      ],
      body: [
        `今天可用于公开叙事的有效信源为 ${validSignals}/${metrics.total}；公开入选 ${metrics.included}/${metrics.total}，有更新未入选 ${metrics.updatedNotSelected}。`,
        sourceInventoryRuntimeSummary(inventoryMetrics)
      ].filter(Boolean).join(" "),
      points: [
        { label: "下一屏", value: "信源运行概况给出完整 metrics 仪表盘。" },
        { label: "固定关系", value: "story 先解释信号，dashboard 随后量化运行状态。" }
      ]
    }),
    sourceSignalStoryCard({
      title: "可见 story",
      subtitle: "visible narrative",
      href: "#section-source-first-dashboard",
      titleIcon: generatedSiteIcon("S2", "#2563eb", "#ffffff"),
      tags: [{ label: "story", kind: "notable" }],
      stats: [{ label: "story", value: String(storyTitles.length) }],
      body: storyTitles.length > 0
        ? `今日主线来自 ${storyTitles.length} 个可见 story。`
        : "今日没有足够清晰的公开 story，本页保留信源运行状态，不强行扩写。",
      points: [
        { label: "标题", value: sourceSignalListText(storyTitles, "暂无可见 story") }
      ]
    }),
    sourceSignalStoryCard({
      title: "有效信源",
      subtitle: "included sources",
      href: "#section-source-inventory",
      titleIcon: generatedSiteIcon("S3", "#16a34a", "#ffffff"),
      tags: [{ label: "included", kind: "major" }],
      stats: [{ label: "公开入选", value: String(metrics.included) }],
      body: includedNames.length > 0
        ? "这些信源直接支撑今天的公开页面。"
        : "今天没有信源进入公开页。",
      points: [
        { label: "代表源", value: sourceSignalListText(includedNames, "暂无公开入选信源") },
        { label: "全量清单", value: "继续查看全量信源清单。" }
      ]
    }),
    sourceSignalStoryCard({
      title: "旁路与缺口",
      subtitle: "updates and gaps",
      href: "#section-source-status-focus",
      titleIcon: generatedSiteIcon("S4", "#ea580c", "#ffffff"),
      tags: [
        { label: "gaps visible", kind: metrics.blocked || metrics.skipped ? "major" : "general" },
        { label: "no hiding", kind: "general" }
      ],
      stats: [
        { label: "旁路更新", value: String(metrics.updatedNotSelected) },
        { label: "低信号", value: String(noSignalCount) },
        { label: "阻塞", value: String(metrics.blocked) },
        { label: "未配置或跳过", value: String(metrics.skipped) }
      ],
      body: sourceSignalGapSentence(blockedNames, skippedNames, metrics),
      points: [
        { label: "有更新未入选", value: sourceSignalListText(updatedNames, "暂无额外旁路更新") },
        { label: "低信号", value: sourceSignalListText(lowSignalNames, "暂无低信号样本") },
        { label: "阻塞/跳过", value: sourceSignalListText([...blockedNames, ...skippedNames], "暂无阻塞或跳过样本") },
        { label: "全量清单", value: "继续查看全量信源清单。" }
      ]
    })
  ];
}

function sourceSignalStoryCard({ title, subtitle, href, titleIcon, tags = [], stats = [], body, points = [] }) {
  return {
    title,
    subtitle,
    href,
    titleIcon,
    group: "首屏信源故事",
    showGroup: false,
    tags,
    stats,
    body,
    points
  };
}

function sourceSignalListText(values = [], emptyText = "暂无") {
  const names = uniqueSourceSignalStrings(values).slice(0, 4);
  return names.length > 0 ? names.join("、") : emptyText;
}

function sourceSignalStoryTitles(stories = [], mainItems = []) {
  const source = Array.isArray(stories) && stories.length > 0 ? stories : mainItems;
  return uniqueSourceSignalStrings(
    (Array.isArray(source) ? source : [])
      .map((item) => item?.title || item?.object || item?.summary)
      .map((title) => trimText(title, 42))
  ).slice(0, 4);
}

function sourceSignalSourceNames(rows = [], predicate, limit) {
  return uniqueSourceSignalStrings(rows.filter(predicate).map((row) => row.name || row.id))
    .slice(0, limit);
}

function sourceSignalGapSentence(blockedNames = [], skippedNames = [], metrics = {}) {
  const parts = [];
  if (blockedNames.length > 0) {
    parts.push(`阻塞信源：${blockedNames.map(escapeMarkdownText).join("、")}`);
  }
  if (skippedNames.length > 0) {
    parts.push(`未配置或跳过：${skippedNames.map(escapeMarkdownText).join("、")}`);
  }
  if (parts.length === 0) {
    return "覆盖提醒：今天没有阻塞或未配置的信源影响公开判断。";
  }
  return `覆盖提醒：${parts.join("；")}；这些缺口已经计入阻塞 ${metrics.blocked || 0}、未配置或跳过 ${metrics.skipped || 0}，不会从固定清单中消失。`;
}

function uniqueSourceSignalStrings(values = []) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

function formatSourceFirstDashboardSection(rows = [], options = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const metrics = sourceFirstMetrics(rows);
  const inventoryMetrics = sourceInventoryRuntimeMetrics(options.sourceInventoryRows);
  return {
    type: "filterable-cards",
    title: "信源运行概况",
    richId: "source-first-dashboard",
    group: "main",
    collapsed: false,
    summary: [
      "今日 story 仍按可回源信息撰写；本节把信源运行状态前置，便于先判断哪些源有效、阻塞、未更新或尚未配置。",
      sourceInventoryRuntimeSummary(inventoryMetrics)
    ].filter(Boolean).join(" "),
    cardClass: "source-metric-card",
    showFilters: false,
    items: sourceMetricDashboardCards(metrics, inventoryMetrics)
  };
}

function sourceMetricDashboardCards(metrics, inventoryMetrics = {}) {
  const lowSignal = metrics.noRecentUpdate + metrics.parsedNotCandidate;
  return [
    sourceMetricDashboardCard({
      title: "全部逻辑信源",
      value: metrics.total,
      tag: { label: "TOTAL", kind: "general" },
      subtitle: "固定展示合同",
      body: "固定展示合同中的公开信源行；公开页只展示读者需要的运行状态，不公开内部候选池、筛选分数或发布调试记录。"
    }),
    sourceMetricDashboardCard({
      title: "公开入选",
      value: metrics.included,
      tag: { label: "有效", kind: "major" },
      subtitle: "进入公开页",
      body: "今天有内容进入公开页，是当前 story 可直接回源的主体信号。"
    }),
    sourceMetricDashboardCard({
      title: "有更新未入选",
      value: metrics.updatedNotSelected,
      tag: { label: "旁路更新", kind: "notable" },
      subtitle: "抓到候选",
      body: "抓到候选但未进入公开页，用来提示有增量信号但未构成今日主线。"
    }),
    sourceMetricDashboardCard({
      title: "阻塞",
      value: metrics.blocked,
      tag: { label: "需处理", kind: "major" },
      secondaryTag: { label: "BLOCKED", kind: "major" },
      subtitle: "不可达或解析阻塞",
      body: "已配置但本轮不可达或解析阻塞；即使为 0 也保留，避免静默失败。"
    }),
    sourceMetricDashboardCard({
      title: "未配置或跳过",
      value: metrics.skipped,
      tag: { label: "需配置", kind: "notable" },
      secondaryTag: { label: "SKIPPED", kind: "notable" },
      subtitle: "缺配置或手动源",
      body: "缺 token/base URL、手动源或占位源；这些缺口会继续留在固定清单中。"
    }),
    sourceMetricDashboardCard({
      title: "低信号",
      value: lowSignal,
      tag: { label: "低信号", kind: "general" },
      secondaryTag: { label: "LOW_SIGNAL", kind: "general" },
      subtitle: "未形成公开候选",
      body: "可访问但没有近期有效更新，或解析到近期内容但未形成候选。",
      stats: [
        { label: "无近期更新", value: String(metrics.noRecentUpdate) },
        { label: "解析未成候选", value: String(metrics.parsedNotCandidate) }
      ]
    })
  ].concat(sourceInventoryMetricDashboardCards(inventoryMetrics));
}

function sourceInventoryMetricDashboardCards(metrics = {}) {
  if (!metrics.total) {
    return [];
  }
  const lowSignal = metrics.noRecentUpdate + metrics.parsedNotCandidate;
  return [
    sourceMetricDashboardCard({
      title: "全量采集入口",
      value: metrics.total,
      tag: { label: "INVENTORY_TOTAL", kind: "general" },
      subtitle: "固定 154 入口",
      body: "固定 source inventory 中的全部采集入口；它们按重要性排序展示，不随当天信号强弱重新排序。",
      stats: [
        { label: "运行态可见", value: `${metrics.known}/${metrics.total}` },
        { label: "逻辑继承", value: String(metrics.inherited) }
      ]
    }),
    sourceMetricDashboardCard({
      title: "已知入口运行态",
      value: metrics.known,
      tag: { label: "RUNTIME_KNOWN", kind: metrics.missing ? "notable" : "major" },
      subtitle: "入口状态覆盖",
      body: "每个采集入口都应能看到 inherited、unreported 或 collection_only 之一，避免静默失败。",
      stats: [
        { label: "缺失运行态", value: String(metrics.missing) }
      ]
    }),
    sourceMetricDashboardCard({
      title: "继承逻辑状态",
      value: metrics.inherited,
      tag: { label: "INHERITED_RUNTIME", kind: "major" },
      subtitle: "映射到今日逻辑源",
      body: "这些采集入口继承今日逻辑信源状态，包含公开入选、有更新未入选、阻塞、未配置、未更新或解析未成候选。",
      stats: [
        { label: "公开入选", value: String(metrics.included) },
        { label: "有更新", value: String(metrics.updatedNotSelected) },
        { label: "阻塞", value: String(metrics.blocked) },
        { label: "未配置/跳过", value: String(metrics.skipped) },
        { label: "低信号", value: String(lowSignal) }
      ]
    }),
    sourceMetricDashboardCard({
      title: "未上报逻辑源",
      value: metrics.unreported,
      tag: { label: "UNREPORTED_RUNTIME", kind: metrics.unreported ? "notable" : "general" },
      subtitle: "有映射但今日缺状态",
      body: "这些采集入口映射到逻辑源，但该逻辑源没有出现在今日 source_effectiveness 表中，需要在全量清单中继续可见。",
      stats: [
        { label: "运行态缺失", value: String(metrics.missing) }
      ]
    }),
    sourceMetricDashboardCard({
      title: "仅采集入口",
      value: metrics.collectionOnly,
      tag: { label: "COLLECTION_ONLY", kind: "general" },
      subtitle: "尚未归入逻辑源",
      body: "这些入口是注册的采集配置或辅助入口，暂未归入每日逻辑信源；它们仍保留在固定清单里，供后续归类。",
      stats: [
        { label: "未知", value: String(metrics.unknown) }
      ]
    })
  ];
}

function sourceMetricDashboardCard({ title, value, tag, secondaryTag, subtitle, body, stats = [] }) {
  return {
    title,
    subtitle,
    group: "信源运行概况",
    showGroup: false,
    tags: [tag, secondaryTag].filter(Boolean),
    stats: [
      { label: "数量", value: String(value) },
      ...stats
    ],
    body
  };
}

function formatSystemOperatingDashboardSection(report, collections = {}) {
  const metrics = systemOperatingMetrics(report, collections);
  if (metrics.source.total === 0) {
    return null;
  }
  return {
    type: "filterable-cards",
    title: "系统运行概况",
    richId: "system-operating-dashboard",
    group: "main",
    collapsed: false,
    summary: "把本期公开内容、信号模块、趋势追踪、信源覆盖和发布质量合成一个首屏仪表盘；只呈现读者需要的公开指标。",
    cardClass: "system-metric-card",
    showFilters: false,
    items: systemMetricDashboardCards(metrics)
  };
}

function systemOperatingMetrics(report, collections = {}) {
  const content = {
    stories: safeCollectionLength(collections.stories),
    mainItems: safeCollectionLength(collections.mainItems),
    hotBlogs: safeCollectionLength(collections.hotBlogs),
    communityLeads: safeCollectionLength(collections.communityLeads),
    officialOrgUpdates: safeCollectionLength(collections.officialOrgUpdates)
  };
  const signalModules = [
    { label: "精选博客", count: safeCollectionLength(collections.hotBlogs) },
    { label: "中文媒体", count: safeCollectionLength(collections.chineseMediaDynamics) },
    { label: "每日追踪", count: safeCollectionLength(collections.dailyTracking) },
    { label: "GitHub", count: safeCollectionLength(collections.githubTrending) },
    { label: "Hugging Face", count: safeCollectionLength(collections.huggingFaceTrending) },
    { label: "Builder", count: safeCollectionLength(collections.builderObservations) },
    { label: "官方组织", count: safeCollectionLength(collections.officialOrgUpdates) },
    { label: "社区线索", count: safeCollectionLength(collections.communityLeads) }
  ];
  const activeSignalModules = signalModules.filter((module) => module.count > 0);
  const trends = {
    total: safeCollectionLength(collections.githubTrending) +
      safeCollectionLength(collections.huggingFaceTrending) +
      safeCollectionLength(collections.dailyTracking),
    github: safeCollectionLength(collections.githubTrending),
    huggingFace: safeCollectionLength(collections.huggingFaceTrending),
    dailyTracking: safeCollectionLength(collections.dailyTracking)
  };
  return {
    content,
    signalModules,
    activeSignalModules,
    trends,
    source: sourceFirstMetrics(collections.sourceEffectivenessRows || []),
    inventory: sourceInventoryRuntimeMetrics(collections.sourceInventoryRows || []),
    quality: publicOperatingQualityMetrics(report?.quality_status)
  };
}

function safeCollectionLength(value) {
  return Array.isArray(value) ? value.length : 0;
}

function publicOperatingQualityMetrics(status) {
  if (!status || typeof status !== "object") {
    return {
      status: "ok",
      degradationCount: 0,
      affectedSections: [],
      publicNote: ""
    };
  }
  const explicitReasons = Array.isArray(status.reasons)
    ? status.reasons.filter((reason) => String(reason || "").trim())
    : [];
  const issueFallbackCount = [
    ...(Array.isArray(status.blocking_issues) ? status.blocking_issues : []),
    ...(Array.isArray(status.degraded_sections) ? status.degraded_sections : []),
    ...(Array.isArray(status.affected_sections) ? status.affected_sections : [])
  ].filter(Boolean).length;
  const affectedSections = (Array.isArray(status.affected_sections) ? status.affected_sections : [])
    .map(publicQualitySectionLabel)
    .filter(Boolean);
  return {
    status: String(status.status || "ok"),
    degradationCount: explicitReasons.length || issueFallbackCount,
    affectedSections,
    publicNote: publicOperatingQualityNote(status.public_note)
  };
}

function publicOperatingQualityNote(note) {
  const text = trimText(note, 72);
  if (!text) {
    return "";
  }
  const hanChars = text.match(/\p{Script=Han}/gu)?.length || 0;
  if (hanChars >= 6 || hanChars / Math.max(text.length, 1) >= 0.25) {
    return text;
  }
  return "部分公开板块降级，请以各板块提示为准。";
}

function publicOperatingQualityStatusLabel(status) {
  const value = String(status || "ok");
  if (value === "ok") return "正常";
  if (value === "degraded") return "降级";
  if (value === "blocked") return "阻断";
  return value;
}

function publicQualitySectionLabel(section) {
  const key = String(section || "").trim();
  const labels = {
    hot_blogs: "精选博客",
    chinese_media_dynamics: "中文媒体",
    daily_tracking: "每日追踪",
    github_trending: "GitHub",
    huggingface_trending: "Hugging Face",
    builder_observations: "Builder",
    official_org_updates: "官方组织",
    community_leads: "社区线索",
    wechat_items: "WeChat",
    zhihu_items: "Zhihu",
    x_items: "X/Twitter"
  };
  if (labels[key]) {
    return labels[key];
  }
  return key.replace(/_items$/u, "").replace(/_/gu, " ").trim();
}

function systemMetricDashboardCards(metrics) {
  const sourceCoverageValue = `${metrics.source.included}/${metrics.source.total}`;
  const sourceNeedsAttention = metrics.source.blocked + metrics.source.skipped;
  const activeModuleNames = metrics.activeSignalModules.map((module) => module.label).join("、") || "暂无公开信号模块";
  const affectedSectionText = metrics.quality.affectedSections.join("、") || "无";
  const qualityBody = metrics.quality.degradationCount > 0
    ? [
      `公开质量状态：${publicOperatingQualityStatusLabel(metrics.quality.status)}。`,
      metrics.quality.publicNote ? `公开说明：${metrics.quality.publicNote}` : "",
      `影响板块：${affectedSectionText}。`
    ].filter(Boolean).join(" ")
    : "当前没有面向读者的公开降级提醒。";
  return [
    systemMetricDashboardCard({
      title: "公开内容规模",
      value: metrics.content.stories,
      tag: { label: "SYSTEM_CONTENT", kind: "major" },
      subtitle: "story 与主体条目",
      body: "首屏先给出可阅读 story 数量，并保留主体条目、深读和社区线索的公开规模。",
      stats: [
        { label: "主体条目", value: String(metrics.content.mainItems) },
        { label: "深读", value: String(metrics.content.hotBlogs) },
        { label: "社区线索", value: String(metrics.content.communityLeads) }
      ]
    }),
    systemMetricDashboardCard({
      title: "信号模块",
      value: metrics.activeSignalModules.length,
      tag: { label: "SYSTEM_SIGNALS", kind: "major" },
      subtitle: "有公开输出的模块",
      body: `本期有输出的公开信号模块：${activeModuleNames}。`,
      stats: metrics.signalModules
        .filter((module) => module.count > 0)
        .slice(0, 5)
        .map((module) => ({ label: module.label, value: String(module.count) }))
    }),
    systemMetricDashboardCard({
      title: "趋势与追踪",
      value: metrics.trends.total,
      tag: { label: "SYSTEM_TRENDS", kind: "notable" },
      subtitle: "榜单与每日追踪",
      body: "把 GitHub、Hugging Face 和每日追踪合并成一个趋势规模指标，方便先判断本期外部动量。",
      stats: [
        { label: "GitHub", value: String(metrics.trends.github) },
        { label: "Hugging Face", value: String(metrics.trends.huggingFace) },
        { label: "每日追踪", value: String(metrics.trends.dailyTracking) }
      ]
    }),
    systemMetricDashboardCard({
      title: "信源覆盖",
      value: sourceCoverageValue,
      tag: { label: "SYSTEM_SOURCES", kind: sourceNeedsAttention > 0 ? "notable" : "major" },
      subtitle: "公开信源与全量入口",
      body: "公开信源覆盖继承信源运行概况；全量入口用于确认完整订阅清单没有静默消失。",
      stats: [
        { label: "候选信源", value: String(metrics.source.updatedNotSelected) },
        { label: "需关注", value: String(sourceNeedsAttention) },
        { label: "全量入口", value: String(metrics.inventory.total || 0) },
        { label: "入口运行态", value: `${metrics.inventory.known || 0}/${metrics.inventory.total || 0}` }
      ]
    }),
    systemMetricDashboardCard({
      title: "运行质量",
      value: metrics.quality.status,
      tag: { label: "SYSTEM_QUALITY", kind: metrics.quality.status === "ok" ? "major" : "notable" },
      subtitle: "公开降级状态",
      body: qualityBody,
      stats: [
        { label: "降级提醒", value: String(metrics.quality.degradationCount) },
        { label: "影响板块", value: String(metrics.quality.affectedSections.length) }
      ]
    })
  ];
}

function systemMetricDashboardCard({ title, value, tag, subtitle, body, stats = [] }) {
  return {
    title,
    subtitle,
    group: "系统运行概况",
    showGroup: false,
    tags: [tag].filter(Boolean),
    stats: [
      { label: "数量", value: String(value) },
      ...stats
    ],
    body
  };
}

function formatSourceMapSections(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const groups = groupedSourceRows(rows);
  if (groups.length === 0) {
    return [];
  }
  return [
    {
      type: "markdown",
      title: "信源图谱",
      richId: "source-map",
      group: "main",
      collapsed: false,
      content: formatSourceMapScanIndex(groups)
    },
    ...groups.map(formatSourceMapGroupSection)
  ];
}

function formatSourceMapScanIndex(groups = []) {
  const tableRows = groups.map((group) => {
    const metrics = sourceFirstMetrics(group.rows);
    const needAction = metrics.blocked + metrics.skipped;
    const lowSignal = metrics.noRecentUpdate + metrics.parsedNotCandidate;
    const href = `#section-${sourceMapGroupAnchor(group)}`;
    return [
      `[${escapeMarkdownTableCell(group.label)}](${href})`,
      group.rows.length,
      metrics.included,
      needAction,
      metrics.updatedNotSelected,
      lowSignal,
      sourceMapGroupIsOpen(group) ? "展开" : "折叠"
    ];
  });
  return [
    "固定顺序快速索引：按板块定位后再展开细项；今日状态只影响计数，不改变排序。",
    "",
    "| 板块 | 总数 | 公开 | 需处理 | 有更新未入选 | 低信号 | 默认 |",
    "|---|---:|---:|---:|---:|---:|---|",
    ...tableRows.map((row) => `| ${row[0]} | ${row.slice(1).map(escapeMarkdownTableCell).join(" | ")} |`)
  ].join("\n");
}

function formatSourceInventorySections(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const sectionGroups = groupedSourceInventoryRows(rows);
  if (sectionGroups.length === 0) {
    return [];
  }
  return [
    formatSourceInventoryIndexSection(rows, sectionGroups),
    ...sectionGroups.map(formatSourceInventoryGroupSection)
  ];
}

function formatSourceInventoryIndexSection(rows = [], sectionGroups = []) {
  return {
    type: "filterable-cards",
    title: "全量信源清单",
    richId: "source-inventory",
    group: "main",
    collapsed: false,
    sourceInventoryFinder: true,
    sourceInventoryFinderTotal: rows.length,
    summary: `${rows.length} 个注册采集入口，按固定信源板块卡片展开；下方明细全部保留，搜索只高亮不隐藏。`,
    cardClass: "source-inventory-section-card",
    showFilters: false,
    items: sectionGroups.map((group, index) => formatSourceInventorySectionCard(group, index))
  };
}

function formatSourceInventorySectionCard(group, index) {
  const enablement = countBy(group.rows, "enablement");
  const kinds = countBy(group.rows, "source_kind");
  const logicalSources = new Set(group.rows.map((row) => row.logical_source_id).filter(Boolean));
  const rankLabel = Number.isFinite(Number(group.rank)) ? `rank ${group.rank}` : "rank unknown";
  return {
    title: group.label,
    subtitle: `${String(index + 1).padStart(2, "0")} · ${group.id}`,
    href: `#section-${sourceInventoryGroupAnchor(group)}`,
    titleIcon: generatedSiteIcon(`S${index + 1}`, "#0f766e", "#ffffff"),
    group: "固定板块",
    showGroup: false,
    tags: [
      { label: group.id, kind: "general" },
      { label: rankLabel, kind: "general" }
    ],
    stats: [
      { label: "采集入口", value: String(group.rows.length), detail: "固定清单行" },
      { label: "逻辑源", value: String(logicalSources.size) },
      { label: "core", value: String(enablement.core || 0) },
      { label: "optional", value: String(enablement.optional || 0) },
      { label: "manual", value: String(enablement.manual || 0) }
    ],
    body: `固定排序第 ${index + 1} 组；完整 ${group.rows.length} 条采集入口在下方明细展开，今日状态不会改变排序。`,
    points: [
      { label: "代表源", value: formatSourceInventoryPlainNameSample(group.rows) },
      { label: "类型分布", value: formatSourceInventoryPlainCountChips(kinds) },
      { label: "保留规则", value: "阻塞、未配置、跳过、手动或无更新的入口仍保留在本组。" }
    ]
  };
}

function formatSourceInventoryPlainCountChips(counts = {}) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => `${label} ${count}`)
    .join(" · ");
}

function formatSourceInventoryPlainNameSample(rows = []) {
  const names = rows
    .slice(0, 4)
    .map((row) => row.name || row.id)
    .filter(Boolean);
  if (rows.length > names.length) {
    names.push(`等 ${rows.length} 个`);
  }
  return names.join("、");
}

function formatSourceInventoryQuickFilters(rows = [], groups = []) {
  const sectionLinks = groups
    .map((group) => `[${escapeMarkdownText(group.label)}](#section-${sourceInventoryGroupAnchor(group)}) ${group.rows.length}`)
    .join(" · ");
  return [
    "### 快速定位（静态扫描，不会隐藏或重排）",
    `- 板块快速定位：${sectionLinks}`,
    `- 启用层级快速定位：${formatSourceInventoryCountChips(countBy(rows, "enablement"))}`,
    `- 类型快速定位：${formatSourceInventoryCountChips(countBy(rows, "source_kind"))}`
  ].join("\n");
}

function formatSourceInventoryFocusLanes(rows = [], groups = []) {
  const lanes = [
    {
      label: "配置待补",
      detail: "安全配置或入口待补齐",
      predicate: (row) => row.config_status === "configuration_needed"
    },
    {
      label: "人工复核",
      detail: "需要人工确认或手动复核",
      predicate: (row) => row.config_status === "manual_review"
    },
    {
      label: "已停用",
      detail: "当前不参与自动采集",
      predicate: (row) => row.config_status === "disabled"
    },
    {
      label: "手动维护",
      detail: "通过人工或半自动流程维护",
      predicate: (row) => row.enablement === "manual"
    },
    {
      label: "平台桥接",
      detail: "平台/RSSHub 桥接入口",
      predicate: (row) => row.source_kind === "rsshub" || ["wechat", "zhihu", "reddit"].includes(String(row.platform || "").toLowerCase())
    }
  ];
  const tableRows = lanes
    .map((lane) => {
      const matches = rows.filter(lane.predicate);
      return [
        lane.label,
        matches.length,
        matches.length > 0 ? formatSourceInventoryLaneLinks(matches, groups) : "当前无",
        `${matches.length > 0 ? formatSourceInventoryNameSample(matches) : "当前无"}；${lane.detail}`
      ];
    })
    .filter(Boolean);

  if (tableRows.length === 0) {
    return "";
  }

  return [
    "### 聚焦入口（静态索引，不会隐藏或重排）",
    "这些入口只把需要关注的固定切片提前到总览；完整 154 条仍在下方分组。",
    "",
    "| 聚焦 | 数量 | 入口 | 代表源 |",
    "|---|---:|---|---|",
    ...tableRows.map((row) =>
      `| ${escapeMarkdownTableCell(row[0])} | ${escapeMarkdownTableCell(row[1])} | ${row[2]} | ${escapeMarkdownTableCell(row[3])} |`
    )
  ].join("\n");
}

function formatSourceInventoryLaneLinks(rows = [], groups = []) {
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const counts = new Map();
  for (const row of rows) {
    const sectionId = String(row?.display_section || "uncategorized");
    counts.set(sectionId, (counts.get(sectionId) || 0) + 1);
  }
  const links = [...counts.entries()]
    .map(([sectionId, count]) => {
      const group = groupById.get(sectionId) || {
        id: sectionId,
        label: String(rows.find((row) => row.display_section === sectionId)?.display_section_label || sectionId),
        rank: 999
      };
      return { group, count };
    })
    .sort((left, right) => Number(left.group.rank || 999) - Number(right.group.rank || 999) || String(left.group.label || "").localeCompare(String(right.group.label || "")));
  const visibleLinks = links.slice(0, 3).map(({ group, count }) =>
    `[${escapeMarkdownText(group.label)}](#section-${sourceInventoryGroupAnchor(group)}) ${count}`
  );
  if (links.length > visibleLinks.length) {
    visibleLinks.push(`另 ${links.length - visibleLinks.length} 组`);
  }
  return visibleLinks.join(" · ");
}

function formatSourceInventoryNameSample(rows = []) {
  const names = rows
    .slice(0, 4)
    .map((row) => row.name || row.id)
    .filter(Boolean)
    .map(escapeMarkdownText);
  if (rows.length > names.length) {
    names.push(`等 ${rows.length} 个`);
  }
  return names.join("、");
}

function groupedSourceInventoryRows(rows = []) {
  const groups = [];
  const bySection = new Map();
  for (const row of rows) {
    const sectionId = String(row?.display_section || "uncategorized");
    if (!bySection.has(sectionId)) {
      const group = {
        id: sectionId,
        label: String(row?.display_section_label || sectionId),
        rank: Number.isFinite(Number(row?.display_section_rank)) ? Number(row.display_section_rank) : 999,
        rows: []
      };
      bySection.set(sectionId, group);
      groups.push(group);
    }
    bySection.get(sectionId).rows.push(row);
  }
  return groups.sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label));
}

function formatSourceInventorySectionSummary(groups = []) {
  return [
    "| 板块 | 采集入口 | 逻辑源映射 | 核心 | 可选 | 手动 |",
    "|---|---:|---:|---:|---:|---:|",
    ...groups.map((group) => {
      const enablement = countBy(group.rows, "enablement");
      const logicalSources = new Set(group.rows.map((row) => row.logical_source_id).filter(Boolean));
      const href = `#section-${sourceInventoryGroupAnchor(group)}`;
      return `| [${escapeMarkdownTableCell(group.label)}](${href}) | ${group.rows.length} | ${logicalSources.size} | ${enablement.core || 0} | ${enablement.optional || 0} | ${enablement.manual || 0} |`;
    })
  ].join("\n");
}

function formatSourceInventoryCompactSummary(title, counts = {}) {
  return `**${escapeMarkdownText(title)}**：${formatSourceInventoryCountChips(counts)}`;
}

function formatSourceInventoryCountChips(counts = {}) {
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, count]) => `${escapeMarkdownText(label)} ${count}`)
    .join(" · ");
}

function formatSourceInventoryGroup(group) {
  const enablement = countBy(group.rows, "enablement");
  const kinds = countBy(group.rows, "source_kind");
  const summary = [
    `${group.rows.length} 个注册采集入口`,
    `core ${enablement.core || 0}`,
    `optional ${enablement.optional || 0}`,
    `manual ${enablement.manual || 0}`
  ].join(" · ");
  return [
    "[回到全量信源清单](#section-source-inventory)",
    "",
    `**本组密度**：${summary}`,
    "",
    formatSourceInventoryCompactSummary("启用层级", enablement),
    "",
    formatSourceInventoryCompactSummary("类型分布", kinds),
    "",
    "**保留规则**：阻塞、未配置、跳过、手动或无更新的入口仍保留在本组；今日状态不会改变排序。",
    "",
    ...group.rows.map(formatSourceInventoryRow)
  ].join("\n");
}

function formatSourceInventoryGroupSection(group) {
  const enablement = countBy(group.rows, "enablement");
  return {
    type: "markdown",
    title: `${group.label} · 采集入口`,
    richId: sourceInventoryGroupAnchor(group),
    group: "main",
    collapsed: false,
    summary: `${group.rows.length} 个注册采集入口 · core ${enablement.core || 0} · optional ${enablement.optional || 0} · manual ${enablement.manual || 0}`,
    content: formatSourceInventoryGroup(group)
  };
}

function sourceInventoryGroupAnchor(group) {
  const slug = String(group?.id || "uncategorized")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `source-inventory-group-${slug || "uncategorized"}`;
}

function formatSourceInventoryRow(row) {
  const details = [
    row.source_kind,
    row.enablement,
    row.tier,
    row.authority,
    row.platform ? `platform:${row.platform}` : "",
    row.config_status
  ].filter(Boolean).map(escapeMarkdownText).join(" / ");
  const logical = row.logical_source_name && row.logical_source_name !== "未归入逻辑源"
    ? `；逻辑源：${escapeMarkdownText(row.logical_source_name)}`
    : "；逻辑源：未归入逻辑源";
  return `- **${escapeMarkdownText(row.name || row.id)}**${logical}${formatSourceInventoryRuntime(row)}；${details}`;
}

function formatSourceInventoryRuntime(row) {
  const statusLabel = String(row?.runtime_status_label || (row?.logical_source_id ? "unreported" : "collection_only"));
  const detail = row?.runtime_status_detail ? `（${escapeMarkdownText(row.runtime_status_detail)}）` : "";
  return `；运行状态：${sourceEffectivenessStatusTag(statusLabel)}${detail}`;
}

function countBy(rows = [], field) {
  const counts = {};
  for (const row of rows) {
    const key = String(row?.[field] || "unknown");
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function formatSourceStatusFocusSection(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const groups = sourceStatusFocusGroups(rows);
  return {
    type: "filterable-cards",
    title: "信源状态焦点",
    richId: "source-status-focus",
    group: "main",
    collapsed: false,
    summary: "先看需要注意的源：阻塞、跳过、无近期更新和有更新未入选都会在这里显式出现；完整固定排序仍保留在下一节。",
    cardClass: "source-status-focus-card",
    showFilters: false,
    items: groups.map(formatSourceStatusFocusCard)
  };
}

function sourceStatusFocusGroups(rows = []) {
  const sortedRows = rows.slice().sort((left, right) =>
    Number(left.display_section_rank || 999) - Number(right.display_section_rank || 999) ||
    Number(left.display_rank || 999) - Number(right.display_rank || 999) ||
    String(left.name || "").localeCompare(String(right.name || ""))
  );
  const groupDefs = [
    {
      title: "需处理",
      statuses: ["blocked", "not_configured_or_skipped"],
      note: "不可达、解析阻塞、缺配置或被跳过"
    },
    {
      title: "有更新未入选",
      statuses: ["updated_not_selected"],
      note: "抓到候选，但今天没有进入公开页"
    },
    {
      title: "无近期更新",
      statuses: ["no_recent_update"],
      note: "源可访问，但没有近期有效更新"
    },
    {
      title: "解析未成候选",
      statuses: ["parsed_not_candidate"],
      note: "解析到近期内容，但没有形成候选"
    }
  ];
  return groupDefs.map((group) => ({
    ...group,
    rows: sortedRows.filter((row) => group.statuses.includes(String(row?.status_label || "")))
  }));
}

function formatSourceStatusFocusCard(group) {
  const statusCounts = group.statuses
    .map((status) => {
      const count = group.rows.filter((row) => String(row?.status_label || "") === status).length;
      return `${status} ${count}`;
    })
    .join(" / ");
  const points = group.rows.length > 0
    ? group.rows.map(formatSourceStatusFocusPoint)
    : [{ label: "代表信源", value: "暂无" }];
  return {
    title: group.title,
    subtitle: group.note,
    group: "信源状态焦点",
    showGroup: false,
    tags: group.statuses.map(sourceStatusFocusTag),
    stats: [
      { label: "数量", value: String(group.rows.length), detail: statusCounts },
      ...group.statuses.map((status) => ({
        label: status,
        value: String(group.rows.filter((row) => String(row?.status_label || "") === status).length)
      }))
    ],
    body: `${group.note}。${statusCounts}`,
    points
  };
}

function sourceStatusFocusTag(status) {
  const value = String(status || "unknown");
  const kind = {
    blocked: "major",
    not_configured_or_skipped: "notable",
    updated_not_selected: "notable",
    no_recent_update: "general",
    parsed_not_candidate: "general"
  }[value] || "general";
  return { label: value, kind };
}

function formatSourceStatusFocusPoint(row) {
  const sectionLabel = row?.display_section_label ? `（${row.display_section_label}）` : "";
  const reason = row?.not_included_reason ? `；原因：${row.not_included_reason}` : "";
  return {
    label: `${row?.name || row?.id}${sectionLabel}`,
    value: [
      sourceBooleanFlags(row),
      `；${Number(row?.candidate_count || 0)} 候选 / ${Number(row?.included_count || 0)} 公开${reason}`
    ].join("")
  };
}

function groupedSourceRows(rows = []) {
  const groups = [];
  const bySection = new Map();
  for (const row of rows) {
    const sectionId = String(row?.display_section || "uncategorized");
    if (!bySection.has(sectionId)) {
      const group = {
        id: sectionId,
        label: String(row?.display_section_label || sectionId),
        rank: Number.isFinite(Number(row?.display_section_rank)) ? Number(row.display_section_rank) : 999,
        rows: []
      };
      bySection.set(sectionId, group);
      groups.push(group);
    }
    bySection.get(sectionId).rows.push(row);
  }
  return groups
    .map((group) => ({
      ...group,
      rows: group.rows.slice().sort((left, right) =>
        Number(left.display_rank || 999) - Number(right.display_rank || 999) ||
        String(left.name || "").localeCompare(String(right.name || ""))
      )
    }))
    .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label));
}

function formatSourceMapGroupSection(group) {
  const metrics = sourceFirstMetrics(group.rows);
  const needAction = metrics.blocked + metrics.skipped;
  return {
    type: "markdown",
    title: group.label,
    richId: sourceMapGroupAnchor(group),
    group: "main",
    collapsed: false,
    summary: `${group.rows.length} 个逻辑信源 · ${metrics.included} 公开 · ${needAction} 需处理`,
    content: formatSourceMapGroup(group)
  };
}

function formatSourceMapGroup(group) {
  const metrics = sourceFirstMetrics(group.rows);
  const summary = [
    `${group.rows.length} 个逻辑信源`,
    `${sourceEffectivenessStatusTag("included")} ${metrics.included}`,
    metrics.blocked > 0 ? `${sourceEffectivenessStatusTag("blocked")} ${metrics.blocked}` : "",
    metrics.skipped > 0 ? `${sourceEffectivenessStatusTag("not_configured_or_skipped")} ${metrics.skipped}` : ""
  ].filter(Boolean).join(" ");
  return [
    summary,
    "",
    ...group.rows.map(formatSourceMapRow)
  ].join("\n");
}

function sourceMapGroupIsOpen(group) {
  return group.rows.some((row) => String(row?.display_mode || "") === "expanded");
}

function sourceMapGroupAnchor(group) {
  const slug = String(group?.id || "uncategorized")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `source-map-group-${slug || "uncategorized"}`;
}

function formatSourceMapRow(row) {
  const candidateText = `${Number(row?.candidate_count || 0)} 候选 / ${Number(row?.included_count || 0)} 公开`;
  const reason = row?.not_included_reason ? `；原因：${escapeMarkdownText(row.not_included_reason)}` : "";
  return [
    `- ${sourceEffectivenessStatusTag(row?.status_label)} **${escapeMarkdownText(row?.name || row?.id)}**：`,
    sourceBooleanFlags(row),
    `；${candidateText}${reason}`
  ].join("");
}

function sourceBooleanFlags(row = {}) {
  return [
    row.configured ? "已配置" : "未配置",
    row.reachable ? "可达" : "不可达",
    row.parsed_recent ? "近期解析" : "未更新",
    row.candidate_created ? "有候选" : "无候选",
    row.public_included ? "已公开" : "未公开"
  ].join(" / ");
}

function sourceEffectivenessStatusTag(statusLabel) {
  const value = String(statusLabel || "unknown");
  const className = {
    included: "checked",
    updated_not_selected: "checked",
    parsed_not_candidate: "no-signal",
    no_recent_update: "no-signal",
    blocked: "blocked",
    not_configured_or_skipped: "skipped"
  }[value] || "unknown";
  return `==tag-status-${className}|${value}==`;
}

function formatPublicSourceCoverage(audit) {
  if (!audit) {
    return "";
  }
  const rows = sourceAuditGroups(audit)
    .map(({ title, group }) => formatPublicSourceCoverageGroup(title, group))
    .filter(Boolean);
  if (rows.length === 0) {
    return "";
  }
  return [
    "本节只保留读者需要知道的覆盖缺口：哪些来源本轮检查过、哪些没有信号、哪些因为配置或来源状态跳过。它不展示内部候选池、筛选分数或发布调试记录。",
    "",
    ...rows
  ].join("\n");
}

function formatPublicSourceCoverageV2(audit) {
  if (!audit) {
    return "";
  }
  const groups = sourceAuditGroups(audit);
  const rows = groups.map(({ title, group }) => formatPublicSourceCoverageGroupV2(title, group)).filter(Boolean);
  if (rows.length === 0) {
    return "";
  }
  const totals = groups.reduce((acc, { group }) => {
    const counts = sourceStatusCounts(group?.sources);
    acc.checked += counts.checked;
    acc.no_signal += counts.no_signal;
    acc.blocked += counts.blocked;
    acc.skipped += counts.skipped;
    return acc;
  }, { checked: 0, no_signal: 0, blocked: 0, skipped: 0 });
  return [
    "本节只展示读者需要知道的信源覆盖状态，不公开内部候选池、筛选分数或发布调试记录。",
    "",
    [
      `${sourceStatusTag("checked")} ${totals.checked}`,
      `${sourceStatusTag("no_signal")} ${totals.no_signal}`,
      `${sourceStatusTag("blocked")} ${totals.blocked}`,
      `${sourceStatusTag("skipped")} ${totals.skipped}`
    ].join(" "),
    "",
    ...rows
  ].join("\n");
}

function formatPublicSourceCoverageGroupV2(title, group) {
  if (!group) {
    return "";
  }
  const counts = sourceStatusCounts(group.sources);
  const total = counts.checked + counts.no_signal + counts.blocked + counts.skipped;
  if (total <= 0) {
    return "";
  }
  const status = [
    `${sourceStatusTag("checked")} ${counts.checked}`,
    `${sourceStatusTag("no_signal")} ${counts.no_signal}`,
    `${sourceStatusTag("blocked")} ${counts.blocked}`,
    `${sourceStatusTag("skipped")} ${counts.skipped}`
  ].join(" ");
  const details = [
    group.checked ? "checked" : "not checked",
    group.blocked_reason ? `blocked_reason: ${group.blocked_reason}` : "",
    group.notes ? `notes: ${trimText(group.notes, 220)}` : ""
  ].filter(Boolean).join(" · ");
  const sources = publicSourceCoverageDetailsV2(group.sources);
  return [
    `<details><summary><strong>${escapeInlineHtml(title)}</strong> ${status}</summary>`,
    "",
    `- ${details || "No group note recorded."}`,
    sources || "- No source-level details recorded.",
    "",
    "</details>"
  ].join("\n");
}

function publicSourceCoverageDetailsV2(sources) {
  return (Array.isArray(sources) ? sources : [])
    .slice(0, 10)
    .map((source) => {
      const name = String(source?.name || "Unknown source").trim();
      const status = String(source?.status || "unknown").trim();
      const notes = String(source?.notes || "").trim();
      return `- ${sourceStatusTag(status)} \`${status}\` ${markdownLink(source?.url, name)}${notes ? `: ${trimText(notes, 180)}` : ""}`;
    })
    .join("\n");
}

function escapeInlineHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPublicSourceCoverageGroup(title, group) {
  if (!group) {
    return "";
  }
  const counts = sourceStatusCounts(group.sources);
  const total = counts.checked + counts.no_signal + counts.blocked + counts.skipped;
  const shouldShow = total > 0 && (
    counts.no_signal > 0 ||
    counts.blocked > 0 ||
    counts.skipped > 0 ||
    /微信|知乎|Reddit|X\/Twitter|Builder|精选博客|搜索/.test(title)
  );
  if (!shouldShow) {
    return "";
  }
  const status = [
    `checked ${counts.checked}`,
    `no_signal ${counts.no_signal}`,
    `blocked ${counts.blocked}`,
    `skipped ${counts.skipped}`
  ].join(" / ");
  const sourceSummary = publicSourceCoverageDetails(group.sources);
  const details = [
    group.checked ? "已检查" : "未检查",
    status,
    group.blocked_reason ? `阻塞：${group.blocked_reason}` : "",
    group.notes ? `说明：${group.notes}` : "",
    sourceSummary ? `来源：${sourceSummary}` : ""
  ].filter(Boolean).join("；");
  return `- **${title}**：${details}`;
}

function publicSourceCoverageDetails(sources) {
  const items = (Array.isArray(sources) ? sources : [])
    .filter((source) => source && (String(source.status || "") !== "checked" || source.notes || /wechat|zhihu|reddit|twitter|x feed/i.test(`${source.name || ""} ${source.url || ""}`)))
    .slice(0, 6)
    .map((source) => {
      const name = String(source.name || "未命名来源").trim();
      const status = String(source.status || "unknown").trim();
      const notes = String(source.notes || "").trim();
      return `${name}：${status}${notes ? `（${notes}）` : ""}`;
    });
  return items.join("；");
}

function formatAuditGroup(title, group) {
  if (!group) {
    return `### ${title}\n\n未记录。`;
  }

  const counts = sourceStatusCounts(group.sources);
  const sources = Array.isArray(group.sources) && group.sources.length > 0
    ? group.sources.map((source) => `- ${markdownLink(source.url, source.name)}：${sourceStatusTag(source.status)}${source.notes ? `，${source.notes}` : ""}`).join("\n")
    : "- 未记录具体来源。";
  const details = [
    `- Source status: ${sourceStatusTag("checked")} ${counts.checked}；${sourceStatusTag("no_signal")} ${counts.no_signal}；${sourceStatusTag("blocked")} ${counts.blocked}；${sourceStatusTag("skipped")} ${counts.skipped}`,
    "- 审计语义：记录本次抓取和解析结果，不保证来源没有被遗漏的动态；no_signal/blocked 需看发布质量说明。",
    `- 检查状态：${group.checked ? "已检查" : "未检查"}`,
    `- 候选 / 入选：${group.candidates_found} / ${group.included}`,
    group.blocked_reason ? `- 阻塞原因：${group.blocked_reason}` : "",
    group.last_successful_feed_at ? `- 上次成功获取：${group.last_successful_feed_at}` : "",
    `- 说明：${group.notes || "无"}`
  ].filter(Boolean);
  return `### ${title}\n\n${details.join("\n")}\n\n${sources}`;
}

function formatSourceAuditOverviewChart(audit, dataHref) {
  if (!audit) {
    return null;
  }
  const rows = sourceAuditGroups(audit)
    .map(({ title, group }) => {
      const counts = sourceStatusCounts(group?.sources);
      const total = counts.checked + counts.no_signal + counts.blocked + counts.skipped;
      if (total === 0) {
        return null;
      }
      return {
        group: title,
        checked: counts.checked,
        status: `checked ${counts.checked} / no_signal ${counts.no_signal} / blocked ${counts.blocked} / skipped ${counts.skipped}`,
        blocked: counts.blocked,
        no_signal: counts.no_signal,
        skipped: counts.skipped
      };
    })
    .filter(Boolean);
  if (rows.length === 0) {
    return null;
  }
  const checked = rows.reduce((sum, row) => sum + row.checked, 0);
  const blocked = rows.reduce((sum, row) => sum + row.blocked, 0);
  const noSignal = rows.reduce((sum, row) => sum + row.no_signal, 0);
  const takeaway = blocked > 0
    ? `本轮有 ${blocked} 个来源阻塞；已检查 ${checked} 个来源，no_signal ${noSignal} 个。`
    : `本轮已检查 ${checked} 个来源，no_signal ${noSignal} 个。`;
  return {
    type: "chart",
    title: "信源状态概览",
    group: "verification",
    status: blocked > 0 ? "warning" : "complete",
    chart: {
      type: "bar",
      title: "各信源组 checked 数量",
      takeaway,
      encoding: {
        label: "group",
        value: "checked",
        status: "status"
      },
      source: {
        label: "source_audit",
        url: dataHref
      },
      altText: "按信源组展示 checked 数量，并在状态列列出 blocked、no_signal 和 skipped。",
      data: rows
    }
  };
}

function sourceAuditGroups(audit) {
  return [
    { title: "GitHub Trending", group: audit.github_trending },
    { title: "Hugging Face Trending", group: audit.huggingface_trending },
    { title: "China AI official sources", group: audit.china_ai_sources },
    { title: "Builder 原始源", group: audit.builder_sources },
    { title: "精选博客与访谈源", group: audit.content_sources },
    { title: "搜索 / 新闻影子源", group: audit.search_sources },
    { title: "信源健康检查", group: audit.sources_health },
    { title: platformItemLabel("wechat"), group: audit.wechat_sources },
    { title: platformItemLabel("zhihu"), group: audit.zhihu_sources },
    { title: platformItemLabel("reddit"), group: audit.reddit_sources }
  ].filter((item) => item.group);
}

function sourceStatusTag(status) {
  const normalized = sourceStatusClass(status);
  const labels = {
    checked: "checked",
    "no-signal": "no_signal",
    blocked: "blocked",
    skipped: "skipped",
    unknown: "unknown"
  };
  return `==tag-status-${normalized}|${labels[normalized]}==`;
}

function sourceStatusClass(status) {
  const value = String(status || "").trim();
  if (value === "checked") return "checked";
  if (value === "no_signal") return "no-signal";
  if (value === "blocked") return "blocked";
  if (value.startsWith("skipped")) return "skipped";
  return "unknown";
}

function sourceStatusCounts(sources) {
  const counts = { checked: 0, no_signal: 0, blocked: 0, skipped: 0 };
  for (const source of Array.isArray(sources) ? sources : []) {
    const status = String(source?.status || "");
    if (status === "checked") counts.checked += 1;
    else if (status === "no_signal") counts.no_signal += 1;
    else if (status === "blocked") counts.blocked += 1;
    else if (status.startsWith("skipped")) counts.skipped += 1;
  }
  return counts;
}

function formatSelfCheck(selfCheck) {
  if (!selfCheck) {
    return "未记录自检。";
  }

  const suggestions = Array.isArray(selfCheck.optimization_suggestions) && selfCheck.optimization_suggestions.length > 0
    ? selfCheck.optimization_suggestions
        .map(formatOptimizationSuggestion)
        .join("\n")
    : "- 本轮无新增建议。";
  return `- 主线条目：${selfCheck.main_items}\n- Builder 观察：${selfCheck.builder_observations}\n- 一手链接：${selfCheck.primary_links ? "通过" : "未通过"}\n- 无禁用表达：${selfCheck.no_banned_words ? "通过" : "未通过"}\n- 无无源数字：${selfCheck.no_unsourced_numbers ? "通过" : "未通过"}\n- 说明：${selfCheck.notes || "无"}\n\n### 提示词与规则迭代建议\n\n${suggestions}`;
}

function formatOptimizationSuggestion(item) {
  const title = item.issue || item.observed_issue || item.suggestion || "建议";
  const change = item.suggestion || item.proposed_change || "";
  const details = [
    stripTrailingSentencePunctuation(change),
    item.expected_benefit ? `为什么要改：${item.expected_benefit}` : ""
  ].filter(Boolean);
  return details.length > 0 ? `- **${title}**：${details.join("；")}` : `- **${title}**`;
}

function stripTrailingSentencePunctuation(value) {
  return String(value || "").trim().replace(/[。；;.\s]+$/u, "");
}

function markdownLink(url, label, options = {}) {
  const icon = options.icon === false ? "" : options.icon || siteIconForUrl(url, label);
  const text = escapeMarkdownText(label || url);
  if (!icon) {
    return `[${text}](${String(url)})`;
  }
  return `[${markdownImage(icon, options.iconLabel || label)} ${text}](${String(url)})`;
}

function markdownImage(url, label) {
  if (!url) {
    return "";
  }
  return `![${escapeMarkdownText(label || "")}](${String(url)})`;
}

function escapeMarkdownText(value) {
  return String(value).replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function sourceIconForName(name) {
  return SOURCE_ICONS.get(String(name || "").trim()) || "";
}

function siteIconForUrl(url, label = "") {
  return resolveLinkIcon(url, { label }).icon;
}

function siteInitials(value) {
  const text = String(value || "").trim();
  const domain = text.includes(".") ? text.split(".").filter(Boolean).slice(0, 2).join(" ") : text;
  const letters = domain
    .replace(/https?:\/\//i, "")
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (letters || "?").slice(0, 3);
}

function siteColor(host) {
  const colors = ["#2563eb", "#0f766e", "#7c3aed", "#be123c", "#b45309", "#374151", "#047857"];
  const text = String(host || "");
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return colors[hash % colors.length];
}

function generatedSiteIcon(label, background, foreground) {
  const text = escapeSvgText(String(label || "?").slice(0, 3).toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${background}"/><text x="16" y="21" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${text.length > 2 ? 10 : 13}" font-weight="700" fill="${foreground}">${text}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function generatedDailyIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse"><stop stop-color="#0f172a"/><stop offset=".55" stop-color="#0891b2"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs><rect width="32" height="32" rx="7" fill="url(#g)"/><path d="M9 9.5h14a2 2 0 0 1 2 2v12H9a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z" fill="#fff" opacity=".94"/><path d="M11 14h7M11 18h10M11 22h6" stroke="#0f172a" stroke-width="1.7" stroke-linecap="round"/><circle cx="22.5" cy="13.5" r="2" fill="#06b6d4"/><path d="M18.5 20.5 22 17l3 2.8" stroke="#ef4444" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function escapeSvgText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeMarkdownTableCell(value) {
  return escapeMarkdownText(value).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
}
